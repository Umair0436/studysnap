# StudySnap Mobile (Expo)

React Native + Expo frontend for the existing FastAPI backend.

## Prerequisites

- Node.js 18+
- Expo Go app (for physical device) OR Android/iOS simulator
- Backend running on port `8000`

## Setup

1. Install dependencies:
   - `npm install`
2. Copy env file:
   - `cp .env.example .env`
3. Set API URL in `.env`:
   - `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000` (Android emulator)
   - `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` (iOS simulator)
   - Physical device: use your PC LAN IP

## Run

- `npm run start`
- `npm run android`
- `npm run ios`
- `npm run web`

## Implemented Screens

- Home + document upload
- Quiz customization
- Document chat
- Quiz interface with progress and score
