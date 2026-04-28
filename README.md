<div align="center">

# 🗓️ CleriTime
### Academic Timetable Management System

*Automated, conflict-free university scheduling powered by AI*

[![Firebase](https://img.shields.io/badge/Firebase-Realtime_DB-FF6F00?style=for-the-badge&logo=firebase&logoColor=white)](https://firebase.google.com)
[![Gemini AI](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3.2-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)](https://getbootstrap.com)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

---

> **CleriTime** solves the NP-Complete problem of university timetable scheduling using a constraint-satisfaction backtracking algorithm with AI-powered suggestions — all in the browser, with zero backend servers.

---

</div>

## 📋 Table of Contents

- [✨ Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [🛠️ Tech Stack](#️-tech-stack)
- [⚙️ Installation & Setup](#️-installation--setup)
- [🚀 Running the App](#-running-the-app)
- [👤 User Roles & Workflows](#-user-roles--workflows)
- [🧠 How the Algorithm Works](#-how-the-algorithm-works)
- [🗄️ Database Schema](#️-database-schema)
- [🔒 Security Rules](#-security-rules)
- [📦 Deployment](#-deployment)

---

## ✨ Features

<table>
<tr>
<td width="33%" valign="top">

### 🔑 Admin
- 📊 Live dashboard stats
- 🎓 Batch & class management
- 🏫 Room & lab configuration
- 👨‍🏫 Teacher unavailability setup
- 📚 Subject configuration (theory & practical)
- ⏱️ Time slot definition
- 🤖 AI-powered scheduling suggestions
- 📋 Conflict analysis after generation
- 📈 Lecture progress reports
- 📢 Notice board management

</td>
<td width="33%" valign="top">

### 👩‍🏫 Faculty
- 📅 Personal weekly schedule view
- ✅ Daily lecture marking (conducted / absent / substituted)
- 🔄 Substitute teacher assignment
- 📊 Subject completion tracking
- 📢 Create & view notices

</td>
<td width="33%" valign="top">

### 🎒 Student
- 📆 Full weekly timetable view
- 🧪 Lab batch filter (practical sessions)
- 📢 Notice board with priority alerts
- 👁️ Teacher & room info per slot

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                   BROWSER (Static Files)              │
│                                                       │
│  index.html ──▶ admin.html / faculty.html / student  │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  Scheduling │  │  Lecture     │  │  Gemini AI  │ │
│  │  Algorithm  │  │  Tracking    │  │  Integration│ │
│  │  (CSP/BT)   │  │  Module      │  │  Module     │ │
│  └─────────────┘  └──────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────┘
              │                          │
              ▼                          ▼
   ┌────────────────────┐    ┌──────────────────────┐
   │  Firebase Realtime │    │  Google Gemini API   │
   │  Database + Auth   │    │  (gemini-2.5-flash)  │
   └────────────────────┘    └──────────────────────┘
```

**No build system. No server. No npm.** All scripts load via `<script>` tags in order — Firebase SDK → `firebase-config.js` → `config.js` → `auth.js` → dashboard JS.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **UI** | HTML5 + Bootstrap 5.3.2 | Responsive interface |
| **Logic** | Vanilla JavaScript (ES6+) | All application logic |
| **Auth** | Firebase Authentication | Email/password login + role routing |
| **Database** | Firebase Realtime Database | NoSQL real-time data sync |
| **AI** | Google Gemini 2.5-flash | Scheduling suggestions & conflict analysis |
| **Icons** | Bootstrap Icons 1.11.1 | UI icons |
| **Fonts** | Inter (Google Fonts) | Typography |

---

## ⚙️ Installation & Setup

### Prerequisites

Before you start, you need accounts for:

- ✅ [Firebase](https://console.firebase.google.com) — free Spark plan works
- ✅ [Google AI Studio](https://aistudio.google.com/apikey) — for Gemini API key

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/your-username/timetable-generator.git
cd timetable-generator
```

---

### Step 2 — Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com) → **Add project**
2. Enable **Authentication** → Sign-in method → **Email/Password**
3. Enable **Realtime Database** → Start in **test mode** (you'll add rules later)
4. Copy your Firebase config from **Project Settings → Your apps**

---

### Step 3 — Configure Firebase (`js/firebase-config.js`)

Open `js/firebase-config.js` and replace the config object:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

> ⚠️ This file is committed to the repo. Do **not** put secret service account keys here — only client-side Firebase config is safe.

---

### Step 4 — Create `js/config.js` *(gitignored — must be created manually)*

This file is in `.gitignore` and **does not exist** after cloning. You must create it:

```javascript
// js/config.js
const APP_CONFIG = {
    adminAccessCode: 'YOUR_ADMIN_SECRET_CODE',   // Required when signing up as Admin
    gemini: {
        apiKey: 'YOUR_GEMINI_API_KEY',           // From aistudio.google.com/apikey
        model: 'gemini-2.5-flash'
    }
};

Object.freeze(APP_CONFIG);
Object.freeze(APP_CONFIG.gemini);
```

> 💡 `adminAccessCode` is the secret code an admin must enter during sign-up. Choose anything you want — e.g., `COLLEGE2025`.

---

### Step 5 — Deploy Firebase Security Rules

Install the Firebase CLI (one-time):

```bash
npm install -g firebase-tools
firebase login
firebase init database     # select your project, accept defaults
```

Deploy the included rules:

```bash
firebase deploy --only database
```

> The `database.rules.json` file in the root is pre-configured: admins can write all data; faculty can write lecture records and notices; students are read-only.

---

## 🚀 Running the App

No build step needed — just serve the static files:

```bash
# Option 1 — Python (built-in)
python3 -m http.server 8080

# Option 2 — Node.js
npx serve .

# Option 3 — VS Code
# Install the "Live Server" extension and click "Go Live"
```

Open **`http://localhost:8080`** in your browser.

---

## 👤 User Roles & Workflows

### 🔑 First-Time Admin Setup

```
Sign Up → enter Admin Access Code → role = admin → admin.html
```

Follow this **exact order** when entering data for the first time:

```
① Batches      →   ② Rooms        →   ③ Time Slots
        ↓
④ Teachers     →   ⑤ Classes      →   ⑥ Subjects
        ↓
⑦ Generate Timetable   →   ⑧ (Optional) Get AI Suggestions
```

> ⚠️ **Order matters.** Classes require a Batch. Subjects require a Class and a Teacher. Timetable generation requires all six to be set up first.

---

#### Batch Setup
| Field | Example | Notes |
|-------|---------|-------|
| Academic Year | `Second Year` | FY / SY / TY / BE |
| Branch | `Computer Engineering` | |
| Semester | `III` | |
| Auto-generated Name | `SY-CO-A` | Used as the class ID prefix |

#### Subject Types
| Type | Lab Required | Consecutive Slots | Batch-Based |
|------|-------------|-------------------|-------------|
| **Theory** | No | No | No |
| **Practical** | Yes (1 fixed lab) | Yes | No |
| **Batch Practical** | Yes (per batch) | Yes | ✅ Yes |

For **Batch Practicals**, configure `batchTeachers` and `batchLabs` separately for each lab batch (B1, B2, B3...). All batches are scheduled simultaneously in the same time slot — each in its own lab.

---

### 🤖 Generating a Timetable

1. Go to **Timetable Generator** section
2. Select a class (or leave blank to generate all classes at once)
3. Click **Generate Timetable**
4. The solver runs up to **5 attempts** with random reordering — typically solves in attempt 1 or 2
5. Optionally click **Get AI Suggestions** before or **Analyze Conflicts** after generation

> 💡 If the timetable shows as `partial`, it means some subjects couldn't fit due to tight constraints — check teacher availability and number of weekly lectures vs. available periods.

---

### 👩‍🏫 Faculty Daily Workflow

```
Login → View Schedule → Select Today's Date
    → For each lecture:
        ✅ Conducted  |  ❌ Absent  |  🔄 Substituted (assign substitute)
    → Track subject completion %
```

---

### 🎒 Student Workflow

```
Login → View Weekly Timetable
    → Toggle "Show My Batch" to filter batch practicals
    → Check Notice Board for announcements
```

---

## 🧠 How the Algorithm Works

CleriTime uses a **Constraint Satisfaction Problem (CSP)** solver — a backtracking search with random restarts.

### The 3 Subject Categories (processed in order)

```
① Batch Practicals   →  grouped so all batches go to their labs simultaneously
② Regular Practicals →  require consecutive slots in a fixed lab
③ Theory Subjects    →  single-period, spread across the week
```

### Hard Constraints Enforced

| Constraint | Rule |
|-----------|------|
| No teacher conflict | A teacher can only be in one place per slot |
| No room conflict | A room can only hold one class per slot |
| No class double-booking | A class can only have one subject per slot |
| Teacher unavailability | Respects configured unavailable slots |
| Practicals need labs | Only lab rooms are used for practicals |
| Consecutive periods | Practicals occupy back-to-back periods, no breaks between |
| Max 2 same subject/day | Theory subjects appear at most twice per day |
| Max 1 practical/day | Each practical subject appears at most once per day |

### Retry Strategy

```
Attempt 1  →  shuffle pool + shuffle days  →  solve()
    ↓ fails?
Attempt 2  →  re-shuffle  →  solve()
    ↓ fails? (up to 5 attempts)
    ↓ all fail?
Save best partial result seen (most slots placed in any attempt)
```

### Complexity

| Algorithm | Complexity | Optimality |
|-----------|-----------|------------|
| **CleriTime (Backtracking CSP)** | O(n × t) average | ~75-90% |
| Brute Force | O(d^n) | 100% |
| Genetic Algorithm | O(g × p × n) | ~90% |

---

## 🗄️ Database Schema

```
Firebase Realtime Database
│
├── users/{uid}               role, name, email, teacherId (faculty), classId (student)
├── batches/{id}              academicYear, branch, semester, name
├── classes/{id}              name, batchId, dept, labBatches[]
├── rooms/{id}                name, type (classroom|lab), capacity
├── teachers/{id}             name, dept, unavailableSlots[]
├── subjects/{id}             name, code, classId, teacherId, type, lecturesPerWeek
│                             [practical]: labRoomId, practicalDuration, isBatchBased
│                             [batch]:     batchTeachers{}, batchLabs{}
├── slots/{id}                day, period, type (period|break), startTime, endTime
│                             Slot ID format: Mon-P1, Tue-P3, Fri-P8
│
├── timetables/{classId}/{slotId}
│       subjectId, subjectName, teacherId, teacherName, roomId, roomName
│       [batch-practical]: batchSchedule{ batch1: {...}, batch2: {...} }
│       status: draft | partial | failed
│
├── lectureRecords/{classId}/{YYYY-MM-DD}/{slotId}
│       status (conducted|absent|substituted), scheduledTeacherId,
│       actualTeacherId, subjectId, substituteReason
│
└── notices/{id}              title, content, priority, audience, authorId, createdAt
```

---

## 🔒 Security Rules

Defined in `database.rules.json` and deployed via Firebase CLI:

| Collection | Read | Write |
|-----------|------|-------|
| `users` | Owner or Admin | Owner only |
| `teachers`, `classes`, `rooms`, `subjects`, `slots`, `timetables` | Any authenticated | Admin only |
| `lectureRecords` | Any authenticated | Admin + Faculty |
| `notices` | Any authenticated | Admin + Faculty |

---

## 📦 Deployment

### Firebase Hosting (Recommended)

```bash
firebase init hosting
# Public directory: .   (root)
# Single-page app: No
# Overwrite index.html: No

firebase deploy
```

Your app will be live at `https://YOUR_PROJECT.web.app`

### Other Static Hosts

Since CleriTime is 100% static, it works on any host:

| Platform | Deploy Command |
|---------|---------------|
| **Vercel** | `npx vercel .` |
| **Netlify** | Drag-and-drop the folder in the Netlify dashboard |
| **GitHub Pages** | Push to `gh-pages` branch |

> 🔑 After deployment, update your Firebase project's **Authorized domains** (Authentication → Settings) to include your new domain.

---

<div align="center">

## 🏫 Built for Universities, by Developers Who Care

**CleriTime** eliminates hours of manual timetable planning, prevents scheduling conflicts, and gives every stakeholder — admin, faculty, and student — a clear, real-time view of the academic schedule.

---

Made with ❤️ using **Firebase** · **Gemini AI** · **Bootstrap**

*© 2026 CleriTime. All rights reserved.*

</div>
