# ProxiSpeak — Mid-Review Viva Script
**Abhay Varshit Aripirala | Team Lead & Backend | Group 10 — Infotact Solutions**
`v0.2-mid` | 66/66 Tests Passing ✅ | Review: 27–30 Oct 2026

> 🗣️ Every **"SAY THIS →"** block is what you speak out loud.
> *(Italic notes)* are silent reminders — do not read them aloud.

---

---

# 🟢 OPENING — Introduce the Project
*(Say this first. When they say "Tell us about yourself and your project.")*

**SAY THIS →**
> "My name is Abhay Varshit Aripirala. I am the Team Lead and Backend Lead for Group 10 at Infotact Solutions.
>
> Our project is called **ProxiSpeak**.
>
> It is a **2D virtual office that runs entirely in the browser**.
> You log in, enter your name, and your avatar appears on a map.
> You move it using the arrow keys or by clicking on the map.
>
> The key idea is — **you can only hear someone's voice if you are close to them**.
> If another avatar comes within **100 pixels** of yours, a voice call starts automatically between you two.
> The closer they are — the louder the voice.
> The farther they walk — the voice fades away and cuts off.
>
> This is exactly how a real office works — you only hear conversations happening near you.
>
> The voice connection uses **WebRTC** — which is a direct browser-to-browser call.
> The audio never goes through our server.
> The server only helps set up the call — then steps back."

---

---

# 📅 WEEK 1 SCRIPT — Server, Movement & Canvas
*(Say this when they ask: "What did you do in Week 1?")*

---

**SAY THIS →**
> "In Week 1, my goal was to build the **complete foundation** — the server, the real-time movement system, and the visual world on screen.
>
> **First — I set up the project from scratch.**
> I created the GitHub repository, the server folder using Node.js, the client folder using React, and set up all four member branches so we could all work without blocking each other.
>
> **Second — I built the Socket.IO server.**
> Socket.IO keeps a permanent live connection between every browser and our server.
> The moment you press an arrow key, your browser sends a move message to the server.
> The server immediately tells every other browser — so everyone sees your avatar move in real time.
> This all happens in milliseconds — no page refresh, no polling.
>
> **Third — I built the in-memory user manager** — a file called `userManager.js`.
> It stores every user's name and position in the server's RAM — not the database.
> RAM is the server's fast working memory — like a desk.
> Finding any user's position takes less than **0.02 milliseconds**.
> If we used MongoDB for every position lookup, it would take 5 to 30 milliseconds — way too slow for smooth movement.
>
> **Fourth — I added coordinate validation and security.**
> Before trusting any position the browser sends, the server checks that X and Y are real numbers.
> If someone sends garbage values like `null`, `NaN`, or text — we reject it.
> We also clamp coordinates so no avatar can go outside the map — max 2000 pixels on each side.
> And we strip HTML tags from usernames to block XSS attacks — where someone puts harmful code in their name.
>
> **Fifth — I stepped in and completed the frontend canvas world.**
> My frontend teammate needed help finishing the visual part.
> I built the floor grid, walls, avatar circles, and the player info display on screen.
> I also built smooth movement using Lerp — instead of the avatar jumping to its new position, it glides smoothly every frame.
> The game loop runs at **60 frames per second** using `requestAnimationFrame`.
>
> By the end of Week 1, I tested everything with multiple browser tabs open, resolved all branch conflicts, merged Week 1 into `main`, and tagged it **v0.1**."

---

## 📖 Week 1 Glossary
*(If they ask "what does X mean?" during Week 1 questions — say the answer next to it)*

| They ask about... | You say... |
|---|---|
| **Socket.IO** | "It keeps a live, always-on connection between the browser and the server — like a walkie-talkie that never switches off. The moment something happens — someone moves, someone joins — all connected browsers hear it instantly." |
| **RAM / In-Memory** | "RAM is the server's fast working memory — like things on your desk. Instantly reachable. A database is like a filing cabinet in another room — takes time to walk over and fetch something. We keep positions in RAM so movement is instant." |
| **JavaScript Map** | "A list where every item has a unique label. You say 'give me the position of user ABC' and it gives it to you immediately — no searching through the whole list." |
| **O(1)** | "This means the speed is always the same — whether there are 2 users or 2000. Our RAM Map is O(1) — always instant, no matter the size." |
| **Coordinate Validation** | "Before trusting any position the browser sends, we check — is X a real number? Is Y a real number? If someone sends `null` or `abc` or a fake value, we reject it immediately." |
| **Clamping** | "Like a fence around the map. If someone sends X = 99999, we push it back to 2000 — the maximum allowed. They physically cannot go outside the map." |
| **XSS Attack** | "If someone types `<script>alert('hacked')</script>` as their username, that code could run inside other users' browsers. We prevent it by stripping all HTML tags from usernames before using them." |
| **Lerp** | "Instead of jumping the avatar to a new position, we move it just a tiny bit closer every single frame — 20% of the remaining distance each frame. It looks like the avatar is gliding smoothly. That's Lerp — Linear Interpolation." |
| **requestAnimationFrame** | "A browser timer that calls your drawing code exactly 60 times every second — giving us a smooth 60 FPS game loop, same as a video game." |
| **HUD** | "The small display on screen showing your username and your current coordinates — like a GPS display in a car dashboard." |
| **v0.1** | "A version label we stamped on the code when Week 1 was fully done — like pressing Save Game. Marks a verified, finished checkpoint." |

---

---

# 📅 WEEK 2 SCRIPT — Proximity Detection & Voice Calling
*(Say this when they ask: "What did you do in Week 2?")*

---

**SAY THIS →**
> "In Week 2, I built the **voice calling system** — everything needed to detect when two people are close, and automatically connect their microphones.
>
> **First — I built the proximity engine.**
> This is a function called `updateProximity()` that runs every time any user moves.
> It calculates the straight-line distance between every pair of users on the map — using the Euclidean distance formula.
> If two users cross inside **100 pixels** of each other, the server sends a `nearby:enter` event to both of them — which tells their browsers to start a voice call.
> If they walk apart beyond 100 pixels, the server sends `nearby:leave` — which tells their browsers to close the call.
> Importantly — the event only fires at the moment of **crossing the boundary**. Moving inside earshot does not keep firing events — that would be wasteful.
>
> **Second — I built the WebRTC signaling relay.**
> WebRTC needs three messages to set up a voice call — an Offer, an Answer, and ICE Candidates.
> Think of it as: Offer is "hey, want to call? Here's my info." Answer is "yes, here's mine." ICE Candidates are the possible network routes they test to find the best path.
> These messages must pass through our server.
> I built the server code that receives them and forwards each one to exactly the right person.
>
> **Third — I added the security guardrail.**
> Before forwarding any voice call message, the server re-checks the actual distance between sender and receiver.
> If they are more than 100 pixels apart — the message is silently dropped.
> This matters because someone could open the browser console and manually send a fake offer to any socket ID — completely bypassing the UI.
> The server check makes that attack impossible.
>
> **Fourth — I solved WebRTC Glare.**
> Glare is a race condition — if Alice and Bob walk toward each other at the exact same millisecond, both their browsers detect proximity at the same time. Both decide to start the call. Both send an Offer to each other simultaneously. This crashes the connection — because you cannot receive an Offer while you are already in the process of sending one.
> My fix: when the server sends the `nearby:enter` event, it compares the two Socket IDs alphabetically. The one that comes first — the smaller ID — gets `shouldInitiateOffer = true`. The other gets `false` and waits.
> Only one Offer is ever sent. Zero chance of collision.
>
> **Fifth — I built the clean disconnect pipeline.**
> When a user closes their browser tab, the server runs these steps in order:
> One — remove the user from RAM.
> Two — cancel any pending database save timer.
> Three — tell all nearby users to close their voice calls.
> Four — safely delete the user's record from MongoDB.
> This ensures no ghost avatars or phantom audio connections are left behind.
>
> **Finally — I integrated Abhishek's audio code** into the visual world, matched the green earshot ring on screen exactly to the 100-pixel server boundary, and added username saving in localStorage so users don't have to retype their name on every refresh.
>
> By the end of Week 2, I merged all four branches, ran all **66 automated tests** — all passing — and tagged the official mid-project release **v0.2-mid**."

---

## 📖 Week 2 Glossary
*(If they ask "what does X mean?" during Week 2 questions — say the answer next to it)*

| They ask about... | You say... |
|---|---|
| **WebRTC** | "It's a technology built into browsers that lets two browsers call each other directly — like a phone call between two people where the phone company only connects the first ring, then steps away. The actual conversation is private and direct — no server in the middle." |
| **Signaling** | "Before two browsers can talk, they need to be introduced. They send small setup messages through our server — Offer, Answer, ICE. Once the call is established, the server is done. Audio flows directly browser to browser. Signaling is just the introduction step." |
| **SDP / Offer / Answer** | "SDP is a text note exchanged during call setup — it says 'I support this audio format, my address is this, connect to me this way.' The Offer is Browser A sending this note first. The Answer is Browser B replying with its own note. After Offer and Answer, both sides know everything about each other." |
| **ICE Candidate** | "Both browsers try many possible network routes to reach each other — WiFi, mobile data, relay servers. Each possible route is one ICE Candidate. The system automatically picks the fastest working one." |
| **WebRTC Glare** | "A crash. Alice and Bob both walk toward each other at the exact same millisecond. Both browsers say 'I'll start the call!' at the same time. Both send an Offer. Both crash — because you can't receive an Offer while you're already sending one. That's Glare." |
| **Offerer Election** | "Our fix for Glare. The server compares both Socket IDs alphabetically — like two words in a dictionary. The one that comes first gets to start the call. The other one waits. Only one Offer is ever sent. Problem solved." |
| **Socket ID** | "Every time a browser connects to our server, the server gives it a random ID like `aBk3fZ`. This is how the server knows who is who. We use these IDs to send messages to exactly the right person." |
| **Lexicographical Order** | "Just means alphabetical order — like a dictionary. `apple` comes before `banana`. We compare two Socket IDs this way to always pick the same person as the one who starts the call. It's consistent and never random." |
| **Euclidean Distance** | "The straight-line ruler distance between two points on a flat surface. On our map, we calculate it as: square root of — x-difference squared plus y-difference squared. This tells us exactly how far apart two avatars are in pixels." |
| **Earshot / 100px Radius** | "An invisible circle around each avatar with a radius of 100 pixels. Anyone who steps inside this circle — voice connects. Anyone outside — silence. Just like standing in a real room." |
| **Proximity Diffing** | "Smart boundary tracking. We don't ask 'are they still close?' every single frame — that's wasteful. Instead, we track who is currently in earshot and only send an event at the exact moment someone enters or exits. Just the change — nothing repeated." |
| **Debouncing** | "A waiting trick. If someone is moving 30 times per second, we don't save to the database 30 times per second. We start a 1-second timer every time they move. If they keep moving, the timer resets. When they finally stop for 1 full second — we save once. Reduces database writes by 95 percent." |
| **GainNode** | "Part of the browser's audio system. It controls how loud a sound is. We calculate it as: gain equals 1 minus distance divided by 100. At 0 pixels — gain is 1 — full volume. At 50 pixels — gain is 0.5 — half volume. At 100 pixels — gain is 0 — completely silent. Fades naturally as you walk away." |
| **StereoPannerNode** | "Part of the audio system that controls which ear hears the sound. If a colleague's avatar is to your right on the map, their voice plays through your right headphone. Makes conversations feel real and spatial." |
| **localStorage** | "A small storage box built into your browser that remembers data even after you close the tab or refresh the page. We use it to remember your username so you don't have to type it again every time." |
| **v0.2-mid** | "The official version label for the mid-review. Stamped on the code after Week 2 was fully complete. All features locked, all 66 tests passing. This is what the reviewers are evaluating." |

---

---

# ❓ Extra Viva Questions
*(Specific questions they might ask — ready answers)*

---

**Q: "Why does the SERVER check the 100px distance before relaying voice messages? Doesn't the client already check?"**

**SAY THIS →**
> "The client check alone is not enough.
> The client is a browser — anyone can open the developer console and manually type a socket emit command to send a fake offer to any user on the map. This completely bypasses the UI and the client-side check.
> If our server were just blindly forwarding these messages, anyone could eavesdrop on a private conversation happening far away on the map.
> So the server re-checks the actual live distance every single time before forwarding any offer, answer, or ICE candidate.
> If the two users are more than 100 pixels apart — the message is silently dropped. The attack is physically impossible."

---

**Q: "Why RAM and not MongoDB for live positions?"**

**SAY THIS →**
> "Speed. If 50 users are each moving 30 times per second, that's 1500 position updates every second. MongoDB takes 5 to 30 milliseconds per read or write — 1500 database calls a second would collapse the system.
> RAM is instant — under 0.02 milliseconds. We only save to MongoDB using debouncing — once per pause, not once per move. This cuts database writes by 95 percent."

---

**Q: "What are your benchmark numbers?"**

**SAY THIS →**
> "Our target was under 20 milliseconds for every proximity check and clustering operation.
> At 100 users — proximity check takes 0.019 milliseconds. Clustering takes 0.36 milliseconds.
> At 200 users — proximity check takes 0.032 milliseconds. Clustering takes 1.35 milliseconds.
> All numbers are well under 20 milliseconds. We are more than a thousand times faster than the required target."

---

**Q: "How many tests and what do they cover?"**

**SAY THIS →**
> "We have 66 automated tests — all 66 pass, 100 percent.
> They cover coordinate validation, the in-memory user manager, the full proximity lifecycle — nearby enter and leave — the WebRTC signaling relay, the 100-pixel security guardrail, the glare prevention rule, debounced database writes, clean disconnect teardown, spatial benchmark timing, and multi-instance server behaviour.
> Run them with `npm test` inside the server folder."

---

*`v0.2-mid` | 66/66 ✅ | `abhay-team-lead` branch | Group 10 — Infotact Solutions*
