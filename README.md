# Real-Time Collaborative Code Platform

A full-stack, real-time collaborative code editor that allows multiple users to edit, run, and debug code simultaneously in a shared environment. Designed for technical interviews, pair programming, and competitive coding.

![Project Status](https://img.shields.io/badge/status-active-success)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🧐 The Problem

Remote pair programming and technical interviews often suffer from "friction fatigue."
1.  **Latency:** Screen sharing is laggy and blurs text.
2.  **Passive Observation:** "Pass the keyboard" doesn't work remotely; usually, only one person can type while the other watches passively.
3.  **Context Switching:** Users have to switch between a communication tool (Zoom/Slack) and a coding tool (IDE).
4.  **State Loss:** Most simple web editors lose the code if the browser tab is refreshed or the internet connection blinks.

## 💡 The Solution

This platform provides a **synchronized, stateful, and executable** environment:
* **Zero-Latency Collaboration:** Uses WebSockets to sync keystrokes instantly between clients.
* **Presence Awareness:** Visualizes remote cursors and selections so users know exactly where their peers are working.
* **Integrated Runtime:** A remote code execution engine (RCE) compiles and runs code (Python, C++, Java) on the server, broadcasting results to all users.
* **Resilience:** Implements a "Hot Cache" architecture using Redis to recover state immediately upon reconnection.

---

## 🏗️ Architecture & Engineering Trade-offs

### 1. Synchronization Strategy: Why no CRDTs?
**Decision:** We chose **WebSocket Broadcasts with "Last-Write-Wins" (LWW)** over Operational Transformation (OT) or Conflict-Free Replicated Data Types (CRDTs).

**The Trade-off:**
* **Complexity vs. Utility:** CRDTs (like Yjs) are excellent for preventing character-level merge conflicts (e.g., two users typing the same word simultaneously). However, in a **pair programming context**, users rarely edit the exact same line at the exact same millisecond. They typically talk and take turns or work on different functions.
* **Overhead:** CRDTs require maintaining a complex history of operations or vector clocks. For a code interview app, the "Authoritative String" is more important than the edit history.
* **Compilation:** To run code, the server needs a valid snapshot of the file. LWW allows us to store the raw string in Redis, making the "Run Code" pipeline significantly faster and simpler than reconstructing a file from a CRDT tree.

### 2. State Management: The "Hot Cache" Pattern
**Decision:** We use **Redis** as the primary store for active sessions and **MongoDB** for long-term persistence.

* **The Problem:** Saving to MongoDB on every keystroke (`keyup` event) would crush the database database with write operations.
* **The Solution:**
    1.  **Real-time:** Keystrokes are debounced and updated in **Redis** (in-memory). This allows O(1) read/write access for instant syncing.
    2.  **Hydration:** When a user joins or reconnects, they fetch the state from Redis, not MongoDB. This solves the "Stale Data" issue on browser refresh.
    3.  **Persistence:** Data is flushed to MongoDB only on explicit "Save" actions or session closure.

### 3. Remote Code Execution (RCE)
**Decision:** Asynchronous Job Queue.
* The server does not run code in the main thread (which would block the event loop).
* Instead, execution requests are pushed to a **Redis Queue**. A separate Worker process picks up the job, executes it in an isolated environment, and pushes the result back via Pub/Sub to the WebSocket server.

---

## 🛠️ Tech Stack

### Frontend
* **React + TypeScript:** Type-safe UI components.
* **Monaco Editor:** The same code editor engine used in VS Code.
* **Socket.io-client:** For bidirectional communication.
* **Tailwind CSS:** For rapid, responsive styling.

### Backend
* **Node.js & Express:** REST API and WebSocket server.
* **Socket.io:** Manages rooms, broadcasting, and fallbacks.
* **Redis:** Pub/Sub for execution results and ephemeral state storage (caching code/cursors).
* **MongoDB:** Persistent storage for user history and chat logs.

---

## ✨ Key Features

1.  **Multiplayer Editing:** See changes character-by-character in real-time.
2.  **Remote Cursors:** Colored vertical bars and highlighted selections show peer activity.
3.  **Live User List:** Auto-updating sidebar showing who is currently online.
4.  **Group Chat:** Built-in messaging to discuss logic without leaving the tab.
5.  **Multi-Language Support:** Run Python, C++, Java, and JavaScript code.
6.  **Disconnection Recovery:** Auto-rejoins and hydrates state if WiFi drops.

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* Docker (Optional, for local Redis/Mongo)
* Redis Server
* MongoDB Instance

### Installation

1.  **Clone the repo**
    ```bash
    git clone [https://github.com/yourusername/collaborative-editor.git](https://github.com/yourusername/collaborative-editor.git)
    cd collaborative-editor
    ```

2.  **Install Dependencies**
    ```bash
    # Install server deps
    cd server
    npm install

    # Install client deps
    cd ../client
    npm install
    ```

3.  **Environment Variables**
    Create a `.env` file in the `server` directory:
    ```env
    PORT=5000
    MONGO_URL=mongodb://localhost:27017/collab-editor
    REDIS_URL=redis://localhost:6379
    ```

4.  **Run the App**
    ```bash
    # Run Server (starts API + Socket + Worker)
    cd server
    npm run dev

    # Run Client
    cd client
    npm run dev
    ```

## 🔮 Future Improvements
* **Voice Chat:** Integrating WebRTC for in-app audio communication.
* **Diff View:** Visualizing changes between saves.
* **syntax Highlighting:** Better support for more languages.

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
