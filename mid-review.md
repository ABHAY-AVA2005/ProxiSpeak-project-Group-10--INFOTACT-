# ProxiSpeak — Mid-Review Viva Script
**Abhay Varshit Aripirala | Team Lead & Backend | Group 10 — Infotact Solutions**
`v0.2-mid` | 66/66 Tests Passing ✅

> 🗣️ **How to use this file:**
> Read every line in the **"SAY THIS →"** blocks out loud.
> The small notes in *(italics)* are reminders for you — don't say them.

---

---

## 🟢 PART 1 — Introducing the Project
*(Say this at the very start when they ask "Tell us about your project")*

---

**SAY THIS →**

> "Our project is called **ProxiSpeak**.
>
> It is a **virtual office that runs in the browser**.
> You log in, enter your name, and your avatar appears on a 2D office map.
> You can walk around using the arrow keys or by clicking on the map.
>
> The **main idea** is — you can only hear someone if you are **close to them** on the map.
> If someone's avatar is within **100 pixels** of yours, a voice call starts automatically.
> The closer you are — the louder their voice.
> The farther you walk away — the voice fades and finally cuts off.
>
> This feels exactly like a real office — where you only hear the conversation happening near you.
>
> The voice is done using **WebRTC** — which is a direct browser-to-browser call.
> The audio does NOT go through our server. The server only helps set up the call.
> Once connected, the audio is completely peer-to-peer."

---

---

## 🟢 PART 2 — My Role
*(Say this when they ask "What was your role?" or "What did you specifically do?")*

---

**SAY THIS →**

> "I am the **Team Lead and Backend Lead** for this project.
>
> My job was to build and own the server — everything that happens behind the scenes.
>
> Specifically, I built:
> - The **real-time server** using Node.js and Socket.IO — so all browsers stay connected and get live updates
> - The **in-memory position system** — so avatar movements are tracked instantly in the server's RAM, not the database
> - The **proximity engine** — which checks every time someone moves, whether they've come within 100 pixels of another user
> - The **WebRTC signaling relay** — which passes the voice call setup messages between browsers
> - The **glare prevention rule** — which stops two people from accidentally starting the same call at the same time
> - The **security guardrail** — so no one can eavesdrop on a conversation by sending fake messages
> - The **disconnect cleanup** — so when someone closes the tab, everything shuts down cleanly with no leftover data
>
> I also stepped in and completed the **frontend canvas world** — the floor, walls, avatars, smooth movement — when my teammate needed help.
>
> And I did all the **branch merges** — combining everyone's code into the main branch at the end of each week."

---

---

## 🟢 PART 3 — Week 1 Work
*(Say this when they ask "What did you do in Week 1?")*

---

**SAY THIS →**

> "In Week 1, I focused on building the **foundation** — the server and real-time movement.
>
> First, I set up the **entire project structure** — the GitHub repo, the server folder using Node.js, the client folder using React, and all four member branches.
>
> Then I built the **Socket.IO server** — this is what keeps every browser permanently connected to our server. Whenever you move your avatar, the browser sends a message to the server, and the server instantly tells all other browsers — so everyone sees each other moving in real time.
>
> I also built the **in-memory user manager** — a file called `userManager.js`. It stores every user's name and position in the server's RAM — not the database. This is because RAM is instant. A database takes 5 to 30 milliseconds for every read or write — that's too slow for 60 frames per second movement. RAM takes less than 0.02 milliseconds.
>
> I also added **coordinate validation and clamping** — so if someone sends a fake or out-of-range position, we reject it or push it back inside the map boundaries. And I stripped HTML from usernames to prevent XSS attacks — where someone puts harmful code in their name.
>
> Finally, I helped complete the **frontend canvas** — the visual map where avatars are drawn, walls are placed, and movement is animated smoothly using Lerp — which means the avatar glides to the new position every frame, instead of jumping there instantly."

---

---

## 🟢 PART 4 — Week 2 Work
*(Say this when they ask "What did you do in Week 2?")*

---

**SAY THIS →**

> "In Week 2, I built the **voice calling system** — everything needed to connect two people's microphones when they walk close to each other.
>
> The first thing I built was the **proximity engine** — a function called `updateProximity()` that runs every time anyone moves. It calculates the straight-line distance between every pair of users — using the Euclidean distance formula — and checks if they crossed the 100-pixel boundary. If two users just entered each other's range, it sends a `nearby:enter` event. If they walked apart, it sends a `nearby:leave` event. It only fires on the moment of crossing — not every frame — so it's efficient.
>
> Then I built the **WebRTC signaling relay**. WebRTC needs three messages to set up a voice call — an Offer, an Answer, and ICE Candidates. These messages need to pass through our server. I built the server code that receives these messages and forwards them to the right person.
>
> I also added a **security rule** — before the server forwards any voice call message, it re-checks the distance between the two users. If they are more than 100 pixels apart, the message is silently dropped. This is important because someone could open the browser console and manually send a fake offer to anyone on the map — bypassing the UI. The server check makes that impossible.
>
> The most interesting problem I solved was **WebRTC Glare**. This is a race condition — if Alice and Bob walk toward each other at the exact same moment, both their browsers try to start the call simultaneously. Both send an Offer to each other at the same time. This crashes the connection. My fix was: when the server sends the `nearby:enter` event, it compares the two Socket IDs alphabetically. The one with the smaller ID gets `shouldInitiateOffer = true`. The other gets `false` and waits. So only one person ever starts the call. Zero chance of collision.
>
> I also built the **disconnect cleanup** — when someone closes their tab, the server removes them from memory, cancels any pending database save, tells all nearby users to close their voice calls, and cleanly deletes their record from MongoDB.
>
> At the end of Week 2, I merged all four branches and tagged the official mid-review version — `v0.2-mid`. All 66 automated tests pass."

---

---

## 🟢 PART 5 — Viva Questions
*(Answers for specific questions they might ask)*

---

### ❓ "What is WebRTC Glare and how did you fix it?"

**SAY THIS →**
> "WebRTC Glare is a race condition.
>
> Imagine Alice and Bob are both walking toward each other. At the exact same millisecond, both their browsers detect that the other is within 100 pixels. Both decide — I'll start the call. Both send an Offer to each other at the same time.
>
> The problem is — you can't receive an Offer while you're already in the middle of sending one. The connection crashes on both sides.
>
> My fix is on the server. When two users enter earshot, the server compares their Socket IDs alphabetically — like comparing two words in a dictionary. The one that comes first — the smaller ID — gets `shouldInitiateOffer = true`. The other gets `false` and simply waits for the incoming Offer.
>
> This way, only one Offer is ever sent for each pair. Zero chance of collision."

---

### ❓ "Why do you store positions in RAM and not in MongoDB?"

**SAY THIS →**
> "Speed.
>
> If 50 users are each moving 30 times per second, that's 1,500 position updates every second. If we read or write from MongoDB on every update, that's 1,500 database calls per second. MongoDB takes 5 to 30 milliseconds per call — the system would collapse.
>
> RAM is completely different. Our in-memory Map gives us a position lookup in under 0.02 milliseconds. That's over a thousand times faster.
>
> We do save to MongoDB — but only when a user stops moving. We use debouncing — a 1-second timer that resets every time they move. So if someone moves continuously, only one save happens when they stop. This cuts database writes by 95%."

---

### ❓ "Why does the server check the 100px distance before relaying signaling messages — doesn't the client already check?"

**SAY THIS →**
> "The client check is not enough on its own.
>
> The client is a browser — anyone can open the developer console and manually type `socket.emit('webrtc:offer', { targetId: 'anyone', sdp: '...' })`. This completely bypasses the UI and the client-side check.
>
> If our server were just blindly forwarding these messages, anyone could send a fake voice call to anyone on the map — and eavesdrop on private conversations.
>
> So before the server forwards any Offer, Answer, or ICE Candidate, it re-calculates the live distance between the sender and the target. If they're more than 100 pixels apart, the message is silently dropped. The attack is physically impossible."

---

### ❓ "How does volume change with distance?"

**SAY THIS →**
> "We use the browser's Web Audio API — specifically a node called `GainNode`. Gain is just volume — a number between 0 and 1.
>
> The formula is: `gain = 1 minus (distance divided by 100)`.
>
> So at 0 pixels — meaning you're right next to each other — gain is 1, which is 100% volume.
> At 50 pixels, gain is 0.5, which is 50% volume.
> At 100 pixels, gain hits 0 — completely silent.
>
> It fades smoothly as you walk away — exactly like a real conversation."

---

### ❓ "How do avatars move smoothly? Why don't they jump?"

**SAY THIS →**
> "We use a technique called Lerp — Linear Interpolation — inside a 60 frames per second loop.
>
> When the server says a user moved to a new X and Y, we don't snap the avatar there immediately. Instead, every frame, we move the avatar just a little bit closer to the target — 20% of the remaining distance each frame.
>
> The formula is: `current = current + (target minus current) times 0.2`
>
> This means the avatar accelerates quickly at first and then slows down as it gets close — which looks very smooth and natural. It also hides any network jitter — small delays between position updates are invisible because the avatar is always smoothly gliding."

---

### ❓ "What are your performance benchmark numbers?"

**SAY THIS →**
> "Our target was — every proximity check and clustering operation must complete in under 20 milliseconds.
>
> We benchmarked at different user counts.
> At 100 users — proximity check takes 0.019 milliseconds. Clustering takes 0.36 milliseconds.
> At 200 users — proximity check takes 0.032 milliseconds. Clustering takes 1.35 milliseconds.
>
> All of these are well under 20 milliseconds. We are more than a thousand times faster than the required target."

---

### ❓ "How many tests do you have and what do they cover?"

**SAY THIS →**
> "We have 66 automated tests and all 66 pass — 100%.
>
> They cover: coordinate validation, in-memory user management, the full proximity lifecycle — nearby enter and leave, the WebRTC signaling relay, the 100-pixel security guardrail, the glare prevention rule — the lower-socket-ID offer rule — debounced database persistence, the disconnect cleanup, spatial benchmark timing, and multi-instance server behavior.
>
> You can run all tests by going into the server folder and running `npm test`."

---

---

## 📖 Quick Word Bank
*(If they ask "what does X mean?" — say the answer next to it)*

| If they ask about... | Say this |
|---|---|
| **Socket.IO** | "It keeps a permanent live connection between the browser and server — like a walkie-talkie that never switches off. When anything happens, both sides hear it instantly." |
| **WebRTC** | "It lets two browsers talk directly — audio goes browser to browser, not through the server. The server only helps them find and connect to each other." |
| **RAM / In-Memory** | "It's the server's fast working memory — like a desk. Things on the desk are instantly reachable. A database is like a filing cabinet in another room — takes time to fetch." |
| **Euclidean Distance** | "The straight-line ruler distance between two points on a flat map. Formula is square root of — x-difference squared plus y-difference squared." |
| **Debouncing** | "Instead of saving to the database every time someone moves — which could be 30 times a second — we wait until they stop for 1 full second, then save once. Reduces writes by 95%." |
| **Lerp** | "Smooth animation — instead of jumping to the new position, the avatar moves a little closer every frame. Makes movement look fluid." |
| **ICE Candidate** | "Information about possible network routes between two browsers. The system tries all routes and picks the best working one automatically." |
| **SDP / Offer / Answer** | "Text messages exchanged during call setup. The Offer says 'I want to call, here's my info.' The Answer says 'Yes, here's mine.' After this exchange, the call is ready." |
| **Clamping** | "Keeping a value inside a fixed range. If someone sends X = 99999, we clamp it to 2000 — the max allowed. They can't go outside the map." |
| **XSS** | "A type of attack where someone puts HTML or script code in a text field — like their username. We strip all HTML so that code never runs." |

---

*`v0.2-mid` | 66/66 ✅ | abhay-team-lead branch | Group 10 — Infotact Solutions*
