# 01 - Project Brief: ProxiSpeak

> Company brief for the internship project. Content is kept as given. Review scoring and GitHub rules are in `03_EVALUATION.md` and `04_GITHUB_RULES.md`. Confidential: do not share outside the team.

## Project title
Project 2 - "ProxiSpeak": Geospatial Proximity Audio Ecosystem

## Problem Statement
Remote collaboration tools (like Zoom) force users into rigid "rooms" where only one person can speak at a time. They lack the spontaneous, spatial dynamics of a real office where you can hear people talking nearby and organically walk over to join a conversation.

## Use Case
An Infotact team logs into ProxiSpeak. They see a 2D overhead map of a virtual office rendered in React Canvas. As a user moves their avatar closer to a group of colleagues, the WebRTC audio dynamically crossfades, becoming louder. The Node.js backend continuously calculates the spatial distances between all avatars using MongoDB Geospatial queries, orchestrating a seamless, organic audio experience for 50+ concurrent users in the same virtual space.

## Key Modules
1. **Geospatial Engine (MongoDB `$near` and `$geoWithin`):** tracks the real-time X/Y coordinates of all users and calculates physical proximity clusters.
2. **Signaling Server (Node.js and Socket.io):** orchestrates the WebRTC peer-to-peer connection handshakes based on who is within "earshot".
3. **Spatial Audio Mixer (Web Audio API):** frontend module that dynamically adjusts the gain (volume) and 3D panning (left/right ear) of peer audio tracks based on relative avatar distance.
4. **2D Virtual World (React and HTML5 Canvas):** a high-performance rendering engine for the virtual office map and real-time avatar movements.

## Week-wise Development Plan
| Week | Backend (Node.js, Express, Socket.io, MongoDB) | Frontend (React, WebRTC, Canvas API) |
|---|---|---|
| Week 1 | Signaling & Movement: Build WebSocket server to broadcast avatar X/Y coordinates. Setup basic MongoDB geospatial schemas. | World Rendering: Build the React Canvas layer. Implement smooth keyboard/mouse avatar movement and coordinate broadcasting. |
| Week 2 | Proximity Calculations: Implement MongoDB $near queries to group users. Logic to only send WebRTC offer/answers to users within a 100-pixel radius. | WebRTC Integration: Implement standard WebRTC peer-to-peer audio connections using the browser's getUserMedia. |
| Mid-Project Review | Spatial Audit: Prove the backend accurately filters and clusters users based on geospatial coordinates under 20ms. | Audio Check: Demonstrate two browsers successfully establishing a WebRTC audio connection via the signaling server. |
| Week 3 | Mesh Scaling: Optimize the WebRTC mesh network. Implement Redis Pub/Sub to allow scaling the Socket.io server across multiple Node instances. | Dynamic Attenuation: Hook WebRTC audio tracks into the Web Audio API. Write algorithms to calculate volume drop-off based on pixel distance. |
| Week 4 | Room Persistence: Save office layouts and furniture obstacles (which block sound) into MongoDB. | Refine & Polish: Add 3D audio panning (stereo separation). Ensure Canvas animations render at a steady 60 FPS. |
| Final Project Review | A highly scalable, stateful geospatial server managing complex P2P routing logic. | An immersive, physics-aware communication platform demonstrating advanced browser audio manipulation. |

## Tech stack (MERN plus)
Node.js, Express, Socket.io (WebSocket signaling server); MongoDB with geospatial queries (`$near`, `$geoWithin`); Redis Pub/Sub (scale Socket.io across Node instances); React and HTML5 Canvas (2D world); WebRTC with getUserMedia (peer-to-peer audio); Web Audio API (gain and 3D panning).

## Performance targets
- Geospatial filtering and clustering under **20 ms**
- **50+ concurrent users** in the same virtual space
- Steady **60 FPS** Canvas rendering
- Proximity (earshot) radius: **100 pixels**

## Project Objective
To provide practical exposure to real-world Web Development workflows. During the internship you are expected to design, develop, test, and maintain web applications, implement responsive user interfaces, integrate databases and APIs, and document your work in accordance with industry standards.

## Scope of Work
- Understand the project requirements and objectives.
- Design and develop responsive web applications.
- Implement front-end and back-end functionalities.
- Integrate databases, APIs, and third-party services as required.
- Test, debug, and optimize application performance.
- Maintain proper version control and code documentation.
- Submit periodic progress updates to the assigned mentor.
- Complete the project within the stipulated timeline.

## Deliverables
- Source Code
- Project Documentation
- Project Report
- Presentation (PPT)
- Final Project Demonstration (deployment and working demo)
- Model Evaluation Results (if applicable; likely not for this project)
- Social media video for both Mid Review and Final Review
- Technical viva at both reviews
- Work Distribution Document (must be submitted before the Mid Review of Month 1)
- Connect the GitHub repository to the project dashboard (credentials provided by Infotact Solutions)

## Terms and Conditions
- The assigned project must be completed within the specified duration.
- All work submitted must be original and free from plagiarism.
- Confidential information obtained during the internship shall not be disclosed to any third party.
- Interns must comply with all company policies and maintain professional conduct.
- Successful completion of the internship is subject to satisfactory project performance and evaluation.

## Closing Remarks (from the company)
Welcome to the Infotect Solutions family. For any clarification regarding the project, contact the assigned mentor or the HR Department.

## Team and stack notes
- Team: Abhay Varshit Aripirala (Team Lead), Tanvi Dighe, Kajal Kumari Singh, Abhishek Bhalla
- Stack decided by team: MERN. All members work with AI IDEs (vibe coding); individual skill levels are not documented.
- Deadline: project end expected about one month from 10 Oct 2026 (about 10 Nov 2026). Mid review rescheduled to 27 to 30 Oct 2026. Final review date not yet known.
