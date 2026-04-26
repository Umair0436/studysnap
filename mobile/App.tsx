import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Screen = "home" | "quizCustom" | "chat" | "quiz";
type QuizKind = "mcq" | "tf" | "mixed";

type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
};

type QuizQuestion = {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
};

type Message = {
  id: number;
  role: "ai" | "user";
  text: string;
};

const palette = {
  bg: "#FFF8F1",
  white: "#FFFFFF",
  orange: "#FF6F00",
  yellow: "#FFD54F",
  text: "#1A1A1A",
  muted: "#7B7B7B",
  border: "#F1E0CF",
  soft: "#FFF2E4",
};

const fallbackApiBaseUrl =
  Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://127.0.0.1:8000";

function resolveApiBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (envUrl) {
    return envUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest2?: { extra?: { expoGo?: { hostUri?: string } } } }).manifest2?.extra
      ?.expoGo?.hostUri;

  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host) {
      return `http://${host}:8000`;
    }
  }

  return fallbackApiBaseUrl;
}

const apiBaseUrl = resolveApiBaseUrl();
const requestTimeoutMs = 30000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function uploadToBackend(file: PickedFile) {
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);

  return fetchWithTimeout(`${apiBaseUrl}/quiz/upload`, {
    method: "POST",
    body: formData,
  });
}

async function generateQuiz(file: PickedFile, qCount: number, qType: QuizKind) {
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);
  formData.append("q_count", String(qCount));
  formData.append("q_type", qType);

  const res = await fetchWithTimeout(`${apiBaseUrl}/quiz/generate`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Quiz generation failed (${res.status}): ${body || "No response body"}`);
  }

  return (await res.json()) as { session_id: string; questions: QuizQuestion[] };
}

async function askQuestion(sessionId: string, question: string) {
  const res = await fetchWithTimeout(`${apiBaseUrl}/chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, question }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat request failed (${res.status}): ${body || "No response body"}`);
  }

  return (await res.json()) as { answer: string; session_id: string };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [sessionId, setSessionId] = useState("");
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  const [qCount, setQCount] = useState(10);
  const [qType, setQType] = useState<QuizKind>("mcq");

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "ai",
      text: "Hello! Upload your notes and ask anything from your document.",
    },
  ]);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const chatScrollRef = useRef<ScrollView | null>(null);

  const currentQuestion = questions[currentIndex];
  const progress = questions.length ? (currentIndex + 1) / questions.length : 0;

  useEffect(() => {
    chatScrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return;
    }

    const file = result.assets[0];
    const fileSizeBytes = file.size ?? 0;
    if (fileSizeBytes > 10 * 1024 * 1024) {
      Alert.alert("File too large", "Please upload a file up to 10MB.");
      return;
    }
    const picked: PickedFile = {
      uri: file.uri,
      name: file.name,
      mimeType: file.mimeType || "application/octet-stream",
    };

    setPickedFile(picked);
    setIsUploading(true);
    try {
      const response = await uploadToBackend(picked);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Upload failed (${response.status}): ${body || "No response body"}`);
      }
      const data = (await response.json()) as { session_id: string };
      setSessionId(data.session_id);
      Alert.alert("Uploaded", "Document uploaded successfully.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      Alert.alert(
        "Upload Error",
        `${msg}\n\nAPI: ${apiBaseUrl}\n\nIf you are using physical phone, set EXPO_PUBLIC_API_BASE_URL to your PC LAN IP (e.g. http://192.168.1.4:8000) and run backend with host 0.0.0.0`
      );
    } finally {
      setIsUploading(false);
    }
  };

  const onGenerateQuiz = async () => {
    if (!pickedFile) {
      Alert.alert("No file", "Please upload a document first.");
      return;
    }

    setIsGenerating(true);
    try {
      const data = await generateQuiz(pickedFile, qCount, qType);
      setQuestions(data.questions);
      setCurrentIndex(0);
      setSelectedOption(null);
      setScore(0);
      if (!sessionId) {
        setSessionId(data.session_id);
      }
      setScreen("quiz");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const onSendChat = async () => {
    const text = chatInput.trim();
    if (!text) {
      return;
    }
    if (!sessionId) {
      Alert.alert("Missing session", "Please upload a document before chatting.");
      return;
    }

    const userMsg: Message = { id: Date.now(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    setIsAsking(true);
    try {
      const data = await askQuestion(sessionId, text);
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: "ai",
        text: data.answer,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          role: "ai",
          text: `I could not reach backend right now. ${msg}`,
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const onNextQuestion = () => {
    if (!currentQuestion) {
      return;
    }
    if (!selectedOption) {
      Alert.alert("Select option", "Please choose an answer first.");
      return;
    }

    if (selectedOption.startsWith(`${currentQuestion.correct}.`)) {
      setScore((s) => s + 1);
    }

    if (currentIndex >= questions.length - 1) {
      const finalScore = score + (selectedOption.startsWith(`${currentQuestion.correct}.`) ? 1 : 0);
      setLastScore(finalScore);
      setResultModalVisible(true);
      return;
    }

    setCurrentIndex((i) => i + 1);
    setSelectedOption(null);
  };

  const homeActionsDisabled = isUploading || !pickedFile;

  const screenTitle = useMemo(() => {
    if (screen === "quizCustom") return "Customize Your Quiz";
    if (screen === "chat") return "Document Chat";
    if (screen === "quiz") return "Quiz";
    return "StudySnap";
  }, [screen]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.brand}>{screenTitle}</Text>
      </View>

      {screen === "home" && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.heroTitle}>Turn notes into knowledge</Text>
          <Text style={styles.heroSub}>Upload your material and let AI do heavy lifting.</Text>
          <Pressable onPress={pickDocument} style={styles.uploadCard}>
            {isUploading ? (
              <ActivityIndicator color={palette.orange} />
            ) : (
              <>
                <Text style={styles.uploadIcon}>📄</Text>
                <Text style={styles.uploadText}>Tap to upload PDF/TXT</Text>
              </>
            )}
          </Pressable>

          {pickedFile && (
            <View style={styles.fileRow}>
              <View>
                <Text style={styles.fileName}>{pickedFile.name}</Text>
                <Text style={styles.fileHint}>
                  {sessionId ? "Uploaded and ready" : "Selected"}
                </Text>
              </View>
              <Text style={styles.readyTag}>{sessionId ? "Uploaded" : "Pending"}</Text>
            </View>
          )}

          <View style={styles.actionGrid}>
            <Pressable
              disabled={homeActionsDisabled}
              onPress={() => setScreen("chat")}
              style={[styles.secondaryBtn, homeActionsDisabled && styles.disabledBtn]}
            >
              <Text style={styles.secondaryBtnText}>Chat with Doc</Text>
            </Pressable>
            <Pressable
              disabled={homeActionsDisabled}
              onPress={() => setScreen("quizCustom")}
              style={[styles.primaryBtn, homeActionsDisabled && styles.disabledBtn]}
            >
              <Text style={styles.primaryBtnText}>Generate Quiz</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {screen === "quizCustom" && (
        <View style={styles.page}>
          <Text style={styles.sectionTitle}>Number of Questions</Text>
          <View style={styles.row}>
            {[5, 10, 15, 20].map((n) => (
              <Pressable
                key={n}
                onPress={() => setQCount(n)}
                style={[styles.pill, qCount === n && styles.pillActive]}
              >
                <Text style={[styles.pillText, qCount === n && styles.pillTextActive]}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Question Type</Text>
          <View style={styles.typeWrap}>
            {[
              { id: "mcq", label: "Multiple Choice" },
              { id: "tf", label: "True / False" },
              { id: "mixed", label: "Mixed" },
            ].map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setQType(item.id as QuizKind)}
                style={[styles.typeBtn, qType === item.id && styles.typeBtnActive]}
              >
                <Text style={[styles.typeText, qType === item.id && styles.typeTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={onGenerateQuiz} style={styles.primaryFullBtn} disabled={isGenerating}>
            {isGenerating ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Start Quiz</Text>
            )}
          </Pressable>

          <Pressable onPress={() => setScreen("home")} style={styles.backBtn}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
      )}

      {screen === "chat" && (
        <KeyboardAvoidingView
          style={styles.chatPage}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <Pressable onPress={() => setScreen("home")} style={styles.chatTopBackBtn}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <ScrollView
            ref={chatScrollRef}
            style={styles.chatMessages}
            contentContainerStyle={styles.chatBody}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.message,
                  msg.role === "user" ? styles.userMessage : styles.aiMessage,
                ]}
              >
                <Text style={msg.role === "user" ? styles.userMessageText : styles.aiMessageText}>
                  {msg.text}
                </Text>
              </View>
            ))}
            {!!chatInput.trim() && (
              <View style={[styles.message, styles.userMessage, styles.draftBubble]}>
                <Text style={styles.userMessageText}>{chatInput}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.chatInputRow}>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask about your document..."
              placeholderTextColor={palette.muted}
              style={styles.input}
              editable={!isAsking}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={onSendChat}
            />
            <Pressable onPress={onSendChat} style={styles.sendBtn} disabled={isAsking}>
              {isAsking ? <ActivityIndicator color={palette.white} /> : <Text style={styles.sendLabel}>Send</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {screen === "quiz" && (
        <View style={styles.page}>
          {!!questions.length && (
            <>
              <Text style={styles.progressText}>
                Question {currentIndex + 1} / {questions.length}
              </Text>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>

              <Text style={styles.questionText}>{currentQuestion.question}</Text>
              <View style={styles.optionWrap}>
                {currentQuestion.options.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setSelectedOption(option)}
                    style={[
                      styles.optionBtn,
                      selectedOption === option && styles.optionBtnActive,
                    ]}
                  >
                    <Text style={styles.optionText}>{option}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={onNextQuestion} style={styles.primaryFullBtn}>
                <Text style={styles.primaryBtnText}>
                  {currentIndex === questions.length - 1 ? "Finish Quiz" : "Next Question"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <Modal visible={resultModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Quiz Completed</Text>
            <Text style={styles.modalScore}>
              Your Score: {lastScore}/{questions.length}
            </Text>
            <Pressable
              style={styles.primaryFullBtn}
              onPress={() => {
                setResultModalVisible(false);
                setScreen("home");
              }}
            >
              <Text style={styles.primaryBtnText}>Back to Home</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  brand: {
    color: palette.orange,
    fontSize: 26,
    fontWeight: "800",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 24,
    gap: 16,
  },
  heroTitle: {
    color: palette.text,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 35,
  },
  heroSub: {
    color: palette.muted,
    fontSize: 13,
  },
  uploadCard: {
    marginTop: 10,
    height: 170,
    borderWidth: 1.4,
    borderColor: palette.border,
    borderStyle: "dashed",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: palette.white,
  },
  uploadIcon: {
    fontSize: 28,
  },
  uploadText: {
    marginTop: 10,
    color: palette.orange,
    fontWeight: "600",
  },
  fileRow: {
    backgroundColor: palette.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fileName: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.text,
  },
  fileHint: {
    marginTop: 2,
    color: palette.muted,
    fontSize: 12,
  },
  readyTag: {
    color: palette.orange,
    fontWeight: "700",
    fontSize: 12,
  },
  actionGrid: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: palette.orange,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.orange,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: palette.white,
  },
  disabledBtn: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: palette.white,
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryBtnText: {
    color: palette.orange,
    fontWeight: "700",
    fontSize: 14,
  },
  page: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 16,
  },
  sectionTitle: {
    marginTop: 8,
    fontWeight: "700",
    fontSize: 16,
    color: palette.text,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pill: {
    minWidth: 60,
    height: 38,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.white,
  },
  pillActive: {
    borderColor: palette.orange,
    backgroundColor: palette.soft,
  },
  pillText: {
    color: palette.muted,
    fontWeight: "600",
  },
  pillTextActive: {
    color: palette.orange,
  },
  typeWrap: {
    gap: 10,
  },
  typeBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    borderRadius: 12,
    padding: 14,
  },
  typeBtnActive: {
    borderColor: palette.orange,
    backgroundColor: palette.soft,
  },
  typeText: {
    color: palette.muted,
    fontWeight: "600",
  },
  typeTextActive: {
    color: palette.orange,
  },
  primaryFullBtn: {
    marginTop: 20,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.orange,
  },
  backBtn: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    height: 44,
  },
  backText: {
    color: palette.orange,
    fontWeight: "700",
  },
  chatPage: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 22,
  },
  chatBody: {
    flexGrow: 1,
    paddingVertical: 8,
    gap: 10,
    paddingBottom: 8,
  },
  chatMessages: {
    flex: 1,
  },
  chatTopBackBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  message: {
    maxWidth: "85%",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  aiMessage: {
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    alignSelf: "flex-start",
  },
  userMessage: {
    backgroundColor: palette.orange,
    alignSelf: "flex-end",
  },
  aiMessageText: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: palette.white,
    fontSize: 14,
    lineHeight: 20,
  },
  chatInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 8,
  },
  draftBubble: {
    opacity: 0.9,
    borderWidth: 1,
    borderColor: "#FFFFFF66",
  },
  input: {
    flex: 1,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: palette.text,
    minHeight: 46,
  },
  sendBtn: {
    backgroundColor: palette.orange,
    borderRadius: 24,
    minWidth: 70,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sendLabel: {
    color: palette.white,
    fontWeight: "700",
  },
  progressText: {
    color: palette.orange,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  progressBg: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: "#F6E7D8",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: palette.orange,
  },
  questionText: {
    marginTop: 8,
    color: palette.text,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
  },
  optionWrap: {
    gap: 10,
    marginTop: 8,
  },
  optionBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  optionBtnActive: {
    borderColor: palette.orange,
    backgroundColor: palette.soft,
  },
  optionText: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: palette.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: palette.orange,
  },
  modalScore: {
    marginTop: 8,
    fontSize: 16,
    color: palette.text,
    fontWeight: "700",
  },
});
