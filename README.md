# Dev-O-Lingo API

REST API backend for the Dev-O-Lingo language learning app. Built with Node.js + Express, Prisma ORM, and MySQL. Handles authentication, lesson progression, daily practice, leaderboards, social features, shop/IAP verification, and push notifications.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express v5 |
| ORM | Prisma |
| Database | MySQL |
| Auth | JWT + Firebase Admin (Google Sign-In verification) |
| Push Notifications | Firebase Admin SDK (FCM) |
| Scheduled Jobs | node-cron |
| Email | Nodemailer |
| IAP Verification | Google Play API (googleapis) |

---

## Project Structure

```
dev-o-lingo-api/
├── index.js                   # Entry point — loads .env and starts Express
├── prisma/
│   ├── schema.prisma          # Full DB schema
│   └── seed.js                # Seed script for initial data
├── scripts/
│   ├── import_content.js      # Bulk import lessons/units
│   └── extract_external_ids.js
└── src/
    ├── app.js                 # Express app setup, mounts /api routes
    ├── middleware.js           # JWT auth middleware
    ├── prismaClient.js         # Shared Prisma client instance
    ├── controller/            # Business logic per feature
    ├── routes/                # Route definitions per feature
    ├── jobs/                  # Cron jobs (reminders, weekly summary)
    └── services/              # FCM send helpers
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- MySQL database
- Firebase project with a service account key

### Install & Run

```bash
npm install
npx prisma generate
npx prisma db push        # or run migrations
npm run dev               # starts with nodemon
```

### Environment Variables (`.env`)

```env
DATABASE_URL=mysql://user:password@host:3306/dbname
JWT_SECRET=your_jwt_secret
PORT=5000

# Firebase Admin
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Google Play IAP verification
GOOGLE_PLAY_CLIENT_EMAIL=
GOOGLE_PLAY_PRIVATE_KEY=
```

---

## Authentication

All protected routes require:
```
Authorization: Bearer <jwt_token>
```

The `authMiddleware` in `middleware.js` verifies the token using `JWT_SECRET` and attaches `req.user = { id, email }`.

---

## API Reference

Base path: `/api`

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/social-login` | No | Google Sign-In — verifies Firebase token, creates user if new, returns JWT |
| POST | `/auth/fetchUserData` | No | Fetch user record by token/uid |
| POST | `/auth/updateFcmToken` | No | Update device FCM token for push notifications |
| GET | `/auth/getOnboardingQuestions` | No | Fetch onboarding questions with options |
| POST | `/auth/submitOnboarding` | No | Save user's onboarding answers |
| POST | `/getUserProfile` | No | Get public profile + stats for a user |

---

### Language & Lessons

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/getHomeLangauge` | No | Returns Units → Lessons hierarchy + `lastCompletedLessonId` for the user |
| POST | `/getExercisesbyId` | Yes | Returns exercise/lesson detail by ID |
| POST | `/submitLesson` | Yes | Validates lesson completion, awards XP/gems, updates streak, returns updated stats |

---

### Progress & Stats

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/getUserStats` | Yes | Returns XP, streak, gems, hearts for the authenticated user |
| GET | `/getPublicUserStats` | Yes | Returns public stats for any user by ID |

---

### Daily Practice

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/daily-practice/week` | Yes | Returns 7-day calendar with status (assigned / completed / locked) |
| POST | `/get-daily-practice` | Yes | Fetches questions for a specific day's practice session |
| POST | `/daily-practice/submit` | Yes | Submits answers, marks practice complete, awards XP/gems |
| GET | `/reviewWrongQuestions` | Yes | Returns questions the user previously answered incorrectly |

---

### Leaderboard

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/getLeaderboard` | Yes | Returns weekly XP rankings for all users |

---

### Social

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/follow` | Yes | Follow a user |
| POST | `/unfollow` | Yes | Unfollow a user |
| POST | `/remove-follower` | Yes | Remove someone from your followers |
| POST | `/block` | Yes | Block a user |
| POST | `/report` | Yes | Report a user with a reason |
| GET | `/followers` | Yes | List users who follow the authenticated user |
| GET | `/following` | Yes | List users the authenticated user follows |

---

### Shop & In-App Purchases

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/shop/items` | No | List all active shop items (gems, hearts, boosters, subscriptions) |
| POST | `/shop/create` | Yes | Create a purchase order (draft) before IAP |
| POST | `/shop/verify` | Yes | Verify IAP receipt from Google Play / App Store, fulfill order |

---

### Ads Rewards

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/ads/reward/hearts` | Yes | Grant hearts after user watches a rewarded ad |
| POST | `/ads/reward/gems` | Yes | Grant gems after user watches a rewarded ad |

---

### Notifications

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | Yes | Fetch paginated notification list for the user |
| POST | `/notifications/read-all` | Yes | Mark all notifications as read |

---

### Achievements

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/achievements` | Yes | Returns all achievements and which ones the user has unlocked |

---

## Database Schema Overview

| Table | Purpose |
|---|---|
| `users` | Core user record — name, email, uid, FCM token, role, login type |
| `user_stats` | XP, streak, gems, hearts per user |
| `user_progress` | Tracks `lastCompletedLessonId` per user per language |
| `languages` | Available languages (e.g., JavaScript, Python) |
| `units` | Groups of lessons within a language |
| `lessons` | Individual lessons within a unit |
| `user_completed_lessons` | Junction table tracking which lessons a user has completed |
| `questions` | MCQ questions with 4 options, correct answer, and optional tasks |
| `daily_practice` | One practice session per user per day |
| `practice_item` | Individual questions within a daily practice session |
| `onboarding_questions` | Dynamic onboarding questions |
| `onboarding_options` | Answer options for onboarding questions |
| `onboarding_responses` | User's submitted onboarding session |
| `onboarding_answers` | Individual answers within an onboarding response |
| `leaderboards` | Weekly XP snapshot per user (`week_year` key) |
| `follows` | Follow relationships between users |
| `blocks` | Block relationships between users |
| `reports` | User reports with reason |
| `shop_items` | Purchasable items (gems, hearts, boosters, subscriptions) |
| `purchase_orders` | IAP order lifecycle (draft → pending_verification → completed/failed) |
| `transactions` | Payment transaction records with platform token/payload |
| `achievements` | Achievement definitions with conditions |
| `user_achievements` | Which achievements each user has unlocked |
| `notifications` | In-app notification records per user |
| `game_settings` | Key-value config for game parameters |
| `exercises` | Standalone exercise/content items |

---

## Scheduled Jobs (Cron)

All jobs run via `node-cron` and are registered in `src/jobs/scheduler.js`.

| Schedule | Job | Description |
|---|---|---|
| Every day at 8:00 AM IST | `sendPracticeReminders` | Morning push notification to practice |
| Every day at 7:00 PM IST | `sendPracticeReminders` | Evening push notification to practice |
| Every day at 9:00 PM IST | `sendStreakBreakWarnings` | Warns users whose streak is at risk |
| Every hour | `sendStreakCountdownReminders` | Sends countdown notification if 1–6 hours remain to keep streak |
| Every day at 12:00 PM IST | `sendReengagementReminders` | Re-engages inactive users |

---

## Key Business Logic

### Lesson Progression
- `submitLesson` checks the submitted lesson against `user_progress.last_completed_lesson_id`.
- On success, XP and gems are awarded, streak is updated, and the new `lastCompletedLessonId` is returned.

### Heart Regeneration
- Hearts regenerate over time based on `last_heart_update` in `user_stats`.
- Max hearts is controlled by `game_settings`.

### Weekly Leaderboard
- `leaderboards` stores a row per `(user_id, week_year)`.
- XP is accumulated each time `submitLesson` is called.

### IAP Flow
1. App calls `POST /shop/create` → creates a `purchase_orders` record with status `draft`.
2. User completes payment on device (Google Play / App Store).
3. App calls `POST /shop/verify` with the platform receipt/token.
4. Server verifies with Google Play API, updates order to `completed`, and credits the user's gems/hearts.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start server with nodemon (hot reload) |
| `npm run generate` | Regenerate Prisma client after schema changes |
| `npm run seed` | Seed the database with initial data |
