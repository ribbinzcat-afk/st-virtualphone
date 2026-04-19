import { getContext } from "../../../extensions.js";
// นำเข้า eventSource จากระบบหลักของ SillyTavern เพื่อดักจับข้อความ
import { eventSource, event_types } from "../../../../script.js";

// --- ระบบจัดการประวัติแชท (Local Storage) ---
const STORAGE_KEY = 'st_virtualphone_line_history';

// --- ระบบฐานข้อมูลรูปภาพ (IndexedDB) ---
let imageDB;
const DB_NAME = "STVirtualPhoneDB";
const STORE_NAME = "images";

// ฟังก์ชันเริ่มต้นฐานข้อมูล
function initImageDB() {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = function(event) {
        imageDB = event.target.result;
        // สร้างตารางเก็บข้อมูล โดยใช้ id (เช่น sticker_cat_cry) เป็นคีย์หลัก
        if (!imageDB.objectStoreNames.contains(STORE_NAME)) {
            imageDB.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
    };

    request.onsuccess = function(event) {
        imageDB = event.target.result;
        console.log("📱 Image Database Loaded!");
        loadSavedImages(); // โหลดรูปมาแสดงในหน้า Settings ทันทีที่ DB พร้อม
    };

    request.onerror = function(event) {
        console.error("📱 Database Error:", event.target.error);
    };
}

// โหลดประวัติแชททั้งหมดจาก Storage
function getAllLineHistory() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

// โหลดประวัติแชทของตัวละครปัจจุบัน
function loadLineHistoryForCurrentChar() {
    const context = getContext();
    const charId = context.characterId;
    if (!charId) return;

    const allHistory = getAllLineHistory();
    const charHistory = allHistory[charId] || [];

    const contentLine = document.getElementById('content-line');
    if (!contentLine) return;

    // ล้างหน้าจอแชทเดิมก่อน
    contentLine.innerHTML = '';

    // นำประวัติมาแสดงบนหน้าจอทีละข้อความ (โดยไม่เซฟซ้ำ)
    charHistory.forEach(msg => {
        renderMessageToUI(msg.senderName, msg.message, msg.isMe, msg.time);
    });
}

// บันทึกข้อความใหม่ลง Storage
function saveLineMessage(senderName, message, isMe, timeString) {
    const context = getContext();
    const charId = context.characterId;
    if (!charId) return;

    const allHistory = getAllLineHistory();
    if (!allHistory[charId]) {
        allHistory[charId] = [];
    }

    // กำหนดว่าข้อความนี้อยู่ในห้องแชทของใคร
    const chatRoom = isMe ? currentActiveLineChat : senderName;

    allHistory[charId].push({
        senderName: senderName,
        message: message,
        isMe: isMe,
        time: timeString,
        chatRoom: chatRoom
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(allHistory));
}

let isPhoneOpen = false;
let isFabVisible = true;
let isDragging = false;
let currentActiveLineChat = "";

// เก็บข้อมูลแอป
const apps = [
    { id: 'line', name: 'Line', icon: '💬', color: '#06C755' },
    { id: 'phone', name: 'Phone', icon: '📞', color: '#34C759' },
    { id: 'music', name: 'Music', icon: '🎵', color: '#FF2D55' },
    { id: 'ig', name: 'Instagram', icon: '📸', color: '#E1306C' },
    { id: 'settings', name: 'Settings', icon: '⚙️', color: '#8E8E93' }
];

function createPhoneUI() {
    // 1. สร้าง Floating Button
    const fab = document.createElement('div');
    fab.id = 'st-phone-fab';
    fab.innerHTML = `📱<div id="st-phone-badge"></div>`;
    document.body.appendChild(fab);
    makeDraggable(fab);

    // 2. สร้างกรอบโทรศัพท์
    const phoneContainer = document.createElement('div');
    phoneContainer.id = 'st-phone-container';

    // สร้าง Home Screen (มีนาฬิกา)
    const screen = document.createElement('div');
    screen.id = 'st-phone-screen';

    const homeScreen = document.createElement('div');
    homeScreen.id = 'st-phone-home';
    homeScreen.innerHTML = `
        <div class="home-clock-widget">
            <div class="home-time" id="home-clock-time">00:00</div>
            <div class="home-date" id="home-clock-date">Mon, Jan 1</div>
        </div>
        <div class="app-grid" id="home-app-grid"></div>
    `;

    // อัปเดตนาฬิกาทุก 1 นาที
    setInterval(() => {
        const now = new Date();
        document.getElementById('home-clock-time').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('home-clock-date').innerText = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }, 1000);

    screen.appendChild(homeScreen);

    // สร้างไอคอนและหน้าต่างแอป
    apps.forEach(app => {
        // สร้างไอคอน
        const appGrid = homeScreen.querySelector('#home-app-grid');
        const appIcon = document.createElement('div');
        appIcon.className = 'st-app-icon';
        appIcon.innerHTML = `
            <div class="st-app-icon-img" style="color: ${app.color};">${app.icon}</div>
            <div class="st-app-badge" id="badge-${app.id}">1</div>
            <div class="st-app-icon-name">${app.name}</div>
        `;
        appIcon.addEventListener('click', () => openApp(app.id, app.name));
        appGrid.appendChild(appIcon);

        // สร้างหน้าต่างแอป
        const appWindow = document.createElement('div');
        appWindow.id = `window-${app.id}`;
        appWindow.className = 'st-app-window';

        if (app.id === 'line') {
            // --- แอป LINE (ดีไซน์ใหม่) ---
            appWindow.innerHTML = `
                <div id="line-chat-list-view" style="display: flex; flex-direction: column; height: 100%;">
                    <div class="st-app-header">
                        <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                        <div>Messages</div>
                        <div style="font-size: 20px;">📝</div>
                    </div>
                    <div class="st-app-content" id="line-chat-list-content" style="padding: 0; background-color: #121212;"></div>
                </div>

                <div id="line-chat-room-view" style="display: none; flex-direction: column; height: 100%;">
                    <div class="st-app-header">
                        <div class="st-back-btn" id="btn-back-to-chatlist">❮</div>
                        <div id="line-chat-title">Name</div>
                        <div style="font-size: 20px;">📞</div>
                    </div>
                    <div class="st-app-content" id="content-line"></div>
                    <div class="line-input-area">
                        <div style="font-size: 20px; color: #888;">＋</div>
                        <input type="text" class="line-input-field" id="line-input" placeholder="Message...">
                        <div class="line-send-btn" id="line-send-btn">Send</div>
                    </div>
                </div>
            `;
        }
        else if (app.id === 'phone') {
            // --- แอป PHONE (หน้าประวัติ -> หน้ารับสาย -> หน้าคุย) ---
            appWindow.innerHTML = `
                <!-- หน้า 1: ประวัติการโทร (Call History) -->
                <div id="phone-history-view" style="display: flex; flex-direction: column; height: 100%;">
                    <div class="st-app-header">
                        <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                        <div>Recent Calls</div>
                        <div></div>
                    </div>
                    <div class="st-app-content" style="padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div class="phone-large-avatar" id="history-avatar" style="width: 100px; height: 100px; margin-bottom: 15px;"></div>
                        <div style="font-size: 24px; font-weight: bold; margin-bottom: 30px;" id="history-name">Character</div>
                        <button class="phone-btn phone-btn-accept" onclick="makeOutgoingCall()">📞</button>
                        <div style="margin-top: 15px; color: #888;">Call</div>
                    </div>
                </div>

                <!-- หน้า 2: สายเรียกเข้า / กำลังโทรออก (เต็มจอ) -->
                <div id="phone-incoming-view" style="display: none; height: 100%; position: relative;">
                    <div class="phone-bg-overlay" id="incoming-bg"></div>
                    <div class="phone-ui-layer">
                        <div class="phone-caller-info">
                            <div class="phone-large-avatar" id="incoming-avatar"></div>
                            <div class="phone-caller-name" id="incoming-name">Unknown</div>
                            <div class="phone-status-text" id="incoming-status">Incoming Call...</div>
                        </div>
                        <div class="phone-action-buttons">
                            <div class="phone-btn phone-btn-decline" onclick="declineCall()">📴</div>
                            <div class="phone-btn phone-btn-accept" id="btn-accept-call" onclick="acceptCall()">📞</div>
                        </div>
                    </div>
                </div>

                <!-- หน้า 3: กำลังคุยสาย (เต็มจอ + แชท) -->
                <div id="phone-active-view" style="display: none; height: 100%; position: relative;">
                    <div class="phone-bg-overlay" id="active-bg"></div>
                    <div class="phone-ui-layer">
                        <div style="padding: 20px; display: flex; align-items: center; gap: 15px; background: rgba(0,0,0,0.5); backdrop-filter: blur(10px);">
                            <div class="line-avatar" id="active-small-avatar" style="width: 45px; height: 45px;"></div>
                            <div>
                                <div style="font-weight: bold; font-size: 18px;" id="active-name">Name</div>
                                <div style="color: #4ade80; font-size: 14px;" id="active-timer">00:00</div>
                            </div>
                            <div class="phone-btn phone-btn-decline" style="width: 45px; height: 45px; font-size: 20px; margin-left: auto;" onclick="endCall()">📴</div>
                        </div>
                        <div id="phone-transcript"></div>
                        <div style="padding: 15px; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; gap: 10px;">
                            <input type="text" id="phone-input" placeholder="Speak..." style="flex: 1; border: none; border-radius: 20px; padding: 10px 15px; background: rgba(255,255,255,0.1); color: white; outline: none;">
                            <div style="color: #a78bfa; padding: 10px; font-weight: bold; cursor: pointer;" onclick="sendPhoneMessage()">Send</div>
                        </div>
                    </div>
                </div>
            `;
        }
        else if (app.id === 'ig') {
            // --- แอป IG (มีปุ่มอัปโหลด + ช่องคอมเมนต์) ---
            appWindow.innerHTML = `
                <div class="st-app-header">
                    <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                    <div style="font-family: 'Comic Sans MS', cursive; font-size: 20px; font-weight: bold;">Instagram</div>
                    <div style="font-size: 24px; cursor: pointer;" onclick="document.getElementById('ig-upload-modal').style.display='flex'">➕</div>
                </div>
                <div class="st-app-content" id="content-ig" style="background-color: #000;">
                    <div style="text-align: center; padding: 40px; color: #666;">No posts yet.</div>
                </div>

                <!-- Modal อัปโหลด IG -->
                <div id="ig-upload-modal">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                        <span style="font-size: 18px; cursor: pointer; color: white;" onclick="document.getElementById('ig-upload-modal').style.display='none'">✕ Cancel</span>
                        <span style="font-size: 18px; cursor: pointer; color: #38bdf8; font-weight: bold;" onclick="postMyIG()">Share</span>
                    </div>
                    <input type="file" id="ig-my-file" accept="image/*" style="display: none;" onchange="previewMyIGImage(this)">
                    <div style="width: 100%; height: 250px; background: #222; border-radius: 15px; margin-bottom: 15px; display: flex; justify-content: center; align-items: center; cursor: pointer; overflow: hidden;" onclick="document.getElementById('ig-my-file').click()">
                        <img id="ig-my-preview" style="display: none; width: 100%; height: 100%; object-fit: cover;">
                        <span id="ig-my-placeholder" style="color: #888;">Tap to select image</span>
                    </div>
                    <textarea id="ig-my-caption" class="ig-modal-input" rows="3" placeholder="Write a caption..."></textarea>
                    <textarea id="ig-my-hidden-context" class="ig-modal-input" rows="2" placeholder="Hidden Context for AI (e.g. ภาพเซลฟี่ในห้องนอน)"></textarea>
                </div>
            `;
        } else if (app.id === 'music') {
            // --- โครงสร้างแอป MUSIC ---
            appWindow.innerHTML = `
                <div class="st-app-header">
                    <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                    <div>Music Player</div>
                    <div class="line-header-icons">⋮</div>
                </div>
                <div class="st-app-content music-player-container">
                    <div class="music-disc" id="music-disc-anim">
                        <div class="music-disc-center"></div>
                    </div>

                    <div class="music-status-text" id="music-now-playing">
                        No track currently playing.<br>Waiting for a song link...
                    </div>

                    <div class="music-iframe-wrapper" id="music-player-frame">
                        <div style="color: #666; font-size: 12px;">Player will appear here</div>
                    </div>
                </div>
            `;
            } else if (app.id === 'settings') {
            // --- โครงสร้างแอป SETTINGS (แก้ไขปุ่มอัปโหลด) ---
            appWindow.innerHTML = `
                <div class="st-app-header" style="background-color: #f2f2f7;">
                    <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                    <div>Settings</div>
                    <div style="width: 20px;"></div>
                </div>
                <div class="st-app-content settings-container">

                    <!-- ส่วนที่ 1: ปรับแต่งโทรศัพท์ -->
                    <div class="settings-section">
                        <h4>🎨 Personalization</h4>
                        <div class="settings-row">
                            <span>Phone Color</span>
                            <input type="color" id="setting-phone-color" value="#333333" class="settings-input" style="width: 50px; padding: 0;">
                        </div>
                        <div class="settings-row">
                            <span>Wallpaper URL</span>
                            <input type="text" id="setting-wallpaper-url" placeholder="Paste link here" class="settings-input">
                        </div>

                        <!-- แก้ไข: ปุ่มอัปโหลด Wallpaper -->
                        <div class="settings-row" style="justify-content: flex-end;">
                            <input type="file" id="setting-wallpaper-file" accept="image/*" style="display: none;" onchange="handleWallpaperUpload(this)">
                            <button class="settings-btn" style="background-color: #6c757d;" onclick="document.getElementById('setting-wallpaper-file').click()">📂 Upload from PC</button>
                        </div>

                        <button class="settings-btn" style="width: 100%; margin-top: 10px;" onclick="applyPhoneSettings()">Apply Changes</button>
                    </div>

                    <!-- ส่วนที่ 2: จัดการรูปภาพ (Sticker / IG) -->
                    <div class="settings-section">
                        <h4>🖼️ Image Library (Sticker/IG)</h4>

                        <!-- แก้ไข: ปุ่มเลือกไฟล์ Sticker/IG -->
                        <div class="settings-row" style="justify-content: center;">
                            <input type="file" id="image-file-input" accept="image/*" style="display: none;" onchange="previewImageFile(this)">
                            <button class="settings-btn" style="background-color: #6c757d; width: 100%;" onclick="document.getElementById('image-file-input').click()">📂 Choose Image File</button>
                        </div>

                        <!-- พื้นที่พรีวิว -->
                        <div id="image-preview-container" style="display: none; text-align: center; margin-bottom: 15px;">
                            <img id="image-preview-img" src="" style="max-width: 100px; max-height: 100px; border-radius: 8px; border: 1px solid #ddd;">
                        </div>

                        <div class="settings-row">
                            <select id="image-upload-type" class="settings-input" style="width: 40%;">
                                <option value="sticker">Sticker</option>
                                <option value="ig">IG Local</option>
                            </select>
                            <input type="text" id="image-keyword" placeholder="Keyword (e.g. cat_cry)" class="settings-input" style="width: 55%;">
                        </div>

                        <button class="settings-btn" style="width: 100%; background-color: #28a745; margin-bottom: 10px;" onclick="uploadImageToDB()">Save to Database</button>

                        <div id="sticker-list-container">
                            <div style="text-align: center; color: #888; font-size: 12px;">Loading saved images...</div>
                        </div>
                    </div>

                </div>
            `;
        } else {
            // --- โครงสร้างแอปอื่นๆ (ยังเหมือนเดิม) ---
            appWindow.innerHTML = `
                <div class="st-app-header">
                    <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮ Back</div>
                    <div>${app.name}</div>
                </div>
                <div class="st-app-content" id="content-${app.id}">
                    <p>Welcome to ${app.name} App!</p>
                </div>
            `;
        }
        screen.appendChild(appWindow);
    });

    phoneContainer.appendChild(screen);
    document.body.appendChild(phoneContainer);

    // เรียกใช้ฟังก์ชันอัปเดตนาฬิกาทันที
    document.getElementById('home-clock-time').innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    fab.addEventListener('click', (e) => { if (!isDragging) togglePhone(); });

    // อัปเดต Event Click: เปิดโทรศัพท์ก็ต่อเมื่อ "ไม่ได้กำลังลาก"
    fab.addEventListener('click', (e) => {
        if (!isDragging) {
            togglePhone();
        }
    });

    // --- Event สำหรับช่องพิมพ์ Line (อัปเดตใหม่) ---
    const lineInput = document.getElementById('line-input');
    const lineMicIcon = document.getElementById('line-mic-icon');
    const lineSendBtn = document.getElementById('line-send-btn');

    if (lineInput) {
        lineInput.addEventListener('input', () => {
            if (lineInput.value.trim() !== "") {
                lineMicIcon.style.display = 'none';
                lineSendBtn.style.display = 'block';
            } else {
                lineMicIcon.style.display = 'block';
                lineSendBtn.style.display = 'none';
            }
        });

        // เมื่อกดปุ่ม Send Line
        lineSendBtn.addEventListener('click', () => {
            const text = lineInput.value.trim();
            if (text) {
                // 1. นำข้อความไปโชว์ในแชท Line ฝั่งเรา
                addMessageToLineUI(currentActiveLineChat, text, true);

                // 2. ดึงรายชื่อสติกเกอร์ที่มีทั้งหมดเพื่อส่งไปบอก AI
                let availableStickers = "none";
                if (imageDB) {
                    const tx = imageDB.transaction([STORE_NAME], "readonly");
                    const req = tx.objectStore(STORE_NAME).getAll();
                    req.onsuccess = function(e) {
                        const stickers = e.target.result.filter(img => img.type === 'sticker').map(img => img.keyword);
                        if (stickers.length > 0) availableStickers = stickers.join(', ');

                        // 3. ส่งข้อความเบื้องหลังไปให้ AI
                        const hiddenPrompt = `[Line ไปหา ${currentActiveLineChat}: ${text}] (OOC: คุณสามารถส่งสติกเกอร์ตอบกลับได้โดยพิมพ์ [Sticker: keyword] คีย์เวิร์ดที่คุณมีคือ: ${availableStickers})`;
                        sendHiddenPrompt(hiddenPrompt);
                    };
                } else {
                    const hiddenPrompt = `[Line ไปหา ${currentActiveLineChat}: ${text}]`;
                    sendHiddenPrompt(hiddenPrompt);
                }

                lineInput.value = "";
                lineInput.dispatchEvent(new Event('input'));
            }
        });

        // ให้กด Enter เพื่อส่งได้ด้วย
        lineInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                lineSendBtn.click();
            }
        });
    }
} // ปิดฟังก์ชัน createPhoneUI()

// --- ฟังก์ชันดึงรูป Avatar ---
function getAvatarUrl(isMe, charName) {
    const context = getContext();
    if (isMe) {
        // รูปผู้เล่น (Persona)
        return `/getuseravatar?name=${encodeURIComponent(context.name1)}`;
    } else {
        // รูปบอท (Character)
        // ค้นหาไฟล์รูปจาก characters array ใน context
        let avatarFile = 'default.png';
        const charId = context.characterId;
        if (charId !== undefined && context.characters && context.characters[charId]) {
            avatarFile = context.characters[charId].avatar;
        }
        return `/characters/${encodeURIComponent(avatarFile)}`;
    }
}

// --- ฟังก์ชันเพิ่มข้อความลงใน UI ของ Line ---
function addMessageToLineUI(senderName, message, isMe) {
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. แสดงผลบนหน้าจอ
    renderMessageToUI(senderName, message, isMe, timeString);

    // 2. เซฟลงประวัติแชท
    saveLineMessage(senderName, message, isMe, timeString);
}

// ฟังก์ชันสำหรับวาด UI บับเบิลแชท (ใช้ร่วมกันทั้งตอนรับข้อความใหม่และตอนโหลดประวัติ)
function renderMessageToUI(senderName, message, isMe, timeString) {
    const contentLine = document.getElementById('content-line');
    if (!contentLine) return;

    const avatarUrl = getAvatarUrl(isMe, senderName);
    const msgDiv = document.createElement('div');
    msgDiv.className = `line-msg-wrapper ${isMe ? 'my-message' : 'other-message'}`;

    if (isMe) {
        msgDiv.innerHTML = `
            <div class="line-msg-content">
                <div style="display: flex; flex-direction: row-reverse;">
                    <div class="line-bubble">${message}</div>
                    <div class="line-time">${timeString}</div>
                </div>
            </div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="line-avatar" style="background-image: url('${avatarUrl}');"></div>
            <div class="line-msg-content">
                <div class="line-sender-name">${senderName}</div>
                <div style="display: flex;">
                    <div class="line-bubble">${message}</div>
                    <div class="line-time">${timeString}</div>
                </div>
            </div>
        `;
    }

    contentLine.appendChild(msgDiv);
    contentLine.scrollTop = contentLine.scrollHeight;
}

// --- ระบบ Regex Hook ดักจับข้อความจาก AI (อัปเดตใหม่) ---
function setupMessageHook() {
    eventSource.on(event_types.MESSAGE_RECEIVED, handleNewMessage);

    // อัปเดตชื่อแชท Line และโหลดประวัติแชทเมื่อเปลี่ยนตัวละคร
    eventSource.on(event_types.CHAT_CHANGED, () => {
        const titleElement = document.getElementById('line-chat-title');
        if (titleElement) {
            titleElement.innerText = getContext().name2 || "Chat";
        }

        // โหลดประวัติแชทของตัวละครนี้ขึ้นมาแสดง
        loadLineHistoryForCurrentChar();
    });

}

function handleNewMessage(messageId) {
    const msgElement = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`);
    if (!msgElement) return;

    let text = msgElement.innerHTML;
    let hasNotification = false;

    // Regex ใหม่: ดักจับ [Line: ข้อความ] หรือ [Line|ชื่อ|ข้อความ]
    const lineRegex = /\[Line[:|]\s*(.*?)\]/gi;

    text = text.replace(lineRegex, (match, content) => {
        const context = getContext();
        let sender = context.name2 || "Unknown";
        let message = content.trim();

        // เช็คว่ามีการระบุชื่อไหม (เช่น เร็กซ์|ตื่นหรือยัง)
        if (content.includes('|')) {
            const parts = content.split('|');
            sender = parts[0].trim();
            message = parts[1].trim();
        }

        // เซฟข้อความลงประวัติของคนๆ นั้น
        saveLineMessage(sender, message, false, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        // ถ้าเปิดหน้าต่างแชทของคนนี้อยู่ ให้แสดงข้อความทันที
        if (currentActiveLineChat === sender) {
            renderMessageToUI(sender, message, false, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }

        // อัปเดตหน้ารวมแชท
        updateLineChatList();

        hasNotification = true;
        triggerNotification('line');

        return `<span style="display:none;" class="hidden-line-msg">${match}</span>`;
    });

    // ซ่อนข้อความฝั่งผู้ใช้ที่พิมพ์ผ่านแอป (ไม่ให้โชว์ในแชทหลัก)
    const userHiddenRegex = /\[(Line|Phone|IG|System)(.*?)\]/gi;
    if (msgElement.classList.contains('mes_text') && msgElement.closest('.mes').getAttribute('is_user') === 'true') {
        text = text.replace(userHiddenRegex, (match) => {
            return `<span style="display:none;">${match}</span>`;
        });
        msgElement.innerHTML = text;
    }

        // 1.5 ดักจับสติกเกอร์ใน Line - รูปแบบ: [Sticker: คีย์เวิร์ด] หรือ [Sticker|คีย์เวิร์ด]
    const stickerRegex = /\[Sticker[:|]\s*(.*?)\]/gi;
    text = text.replace(stickerRegex, (match, keyword) => {
        const cleanKeyword = keyword.trim().toLowerCase();
        const context = getContext();
        const sender = context.name2 || "Unknown";

        // สร้าง HTML พิเศษสำหรับสติกเกอร์ (ใส่คลาส st-async-sticker เพื่อรอโหลดรูป)
        const stickerHtml = `<div class="st-async-sticker" data-keyword="${cleanKeyword}" style="width: 120px; height: 120px; background-color: #eee; border-radius: 10px; display: flex; justify-content: center; align-items: center; font-size: 10px; color: #888;">Loading Sticker...</div>`;

        // นำไปแสดงใน Line
        addMessageToLineUI(sender, stickerHtml, false);

        // สั่งให้ไปดึงรูปจาก DB มาใส่
        fetchAndRenderSticker(cleanKeyword);

        hasNotification = true;
        triggerNotification('line');

        return `<span style="display:none;" class="hidden-sticker-msg">${match}</span>`;
    });

    // 2. ดักจับแอป Phone (สายเรียกเข้า) - รูปแบบ: [Call|ชื่อคนโทร] หรือ [Call: ชื่อคนโทร]
    const callRegex = /\[Call[:|]\s*(.*?)\]/gi;
    text = text.replace(callRegex, (match, caller) => {
        const callerName = caller.trim() || (getContext().name2 || "Unknown");

        // เรียกฟังก์ชันให้โทรศัพท์เด้งขึ้นมา
        setTimeout(() => triggerIncomingCall(callerName), 500); // หน่วงเวลาเล็กน้อยให้ดูสมจริง

        hasNotification = true;
        return `<span style="display:none;">${match}</span>`;
    });

    // 3. ดักจับคำพูดระหว่างคุยสาย - รูปแบบ: [Phone: ข้อความ] หรือ [Phone|ชื่อ|ข้อความ]
    const phoneMsgRegex = /\[Phone(?:\|(.*?))?[:|]\s*(.*?)\]/gi;
    text = text.replace(phoneMsgRegex, (match, sender, message) => {
        if (isCallActive) {
            // เอาข้อความไปโชว์เป็นซับไตเติ้ลในหน้าจอโทรศัพท์
            addTranscriptMessage(message.trim(), false);
            hasNotification = true;
            return `<span style="display:none;">${match}</span>`;
        }
        return match; // ถ้าไม่ได้อยู่ในสาย ก็ปล่อยข้อความไว้ปกติ
    });

    // 4. ดักจับแอป Music - รูปแบบ: [Music: ลิงก์ยูทูป/สปอติฟาย] หรือ [Music|ลิงก์]
    const musicRegex = /\[Music[:|]\s*(https?:\/\/[^\s\]]+)\]/gi;
    text = text.replace(musicRegex, (match, url) => {
        const cleanUrl = url.trim();

        // สั่งให้แอป Music เล่นเพลงนี้
        playMusicTrack(cleanUrl);

        hasNotification = true;
        return `<span style="display:none;" class="hidden-music-msg">${match}</span>`;
    });

    // 5. ดักจับ Instagram - รูปแบบ: [IG|source|keyword|caption]
    // ตัวอย่าง: [IG|web|cat|แมวน่ารักจัง] หรือ [IG|local|selfie1|ชุดใหม่]
    const igRegex = /\[IG\|(web|local)\|(.*?)\|(.*?)\]/gi;
    text = text.replace(igRegex, (match, source, keyword, caption) => {

        // สั่งสร้างโพสต์ IG
        createIGPost(source.trim().toLowerCase(), keyword.trim(), caption.trim());

        hasNotification = true;
        triggerNotification('ig'); // แจ้งเตือนแอป IG

        return `<span style="display:none;" class="hidden-ig-msg">${match}</span>`;
    });

    // ถ้ามีการแก้ไขข้อความ ให้เขียนทับกลับไปที่หน้าจอแชทหลัก
    if (hasNotification) {
        msgElement.innerHTML = text;
    }
}

// ฟังก์ชันเปิดแอป
function openApp(appId, appName) {
    // ซ่อนจุดแจ้งเตือนของแอปนั้น
    document.getElementById(`badge-${appId}`).style.display = 'none';
    // โชว์หน้าต่างแอป
    document.getElementById(`window-${appId}`).style.display = 'flex';
}

function togglePhone() {
    const phone = document.getElementById('st-phone-container');
    const badge = document.getElementById('st-phone-badge');
    const fab = document.getElementById('st-phone-fab');

    isPhoneOpen = !isPhoneOpen;

    if (isPhoneOpen) {
        phone.style.display = 'flex';
        badge.style.display = 'none';
        fab.classList.remove('fab-vibrating');
    } else {
        phone.style.display = 'none';
        // ปิดทุกแอปเมื่อปิดโทรศัพท์ ให้กลับไปหน้า Home
        apps.forEach(app => {
            document.getElementById(`window-${app.id}`).style.display = 'none';
        });
    }
}

// 3. ฟังก์ชันเปิด/ปิด ปุ่ม Floating (สำหรับปุ่มในเมนูตั้งค่า)
function toggleFabVisibility() {
    const fab = document.getElementById('st-phone-fab');
    const phone = document.getElementById('st-phone-container');

    isFabVisible = !isFabVisible;

    if (isFabVisible) {
        fab.style.display = 'flex';
    } else {
        fab.style.display = 'none';
        // ถ้าซ่อนปุ่ม ก็ควรซ่อนโทรศัพท์ด้วย
        if (isPhoneOpen) togglePhone();
    }
}

// 4. สร้าง UI ในหน้า Extension Settings ของ SillyTavern
function setupSettingsMenu() {
    const settingsHtml = `
        <div class="st-phone-settings-wrapper">
            <h4>📱 Virtual Phone Settings</h4>
            <button id="btn-toggle-phone" class="st-phone-settings-btn">Open/Close Phone</button>
            <button id="btn-toggle-fab" class="st-phone-settings-btn">Show/Hide Floating Button</button>
            <hr>
            <h4>💬 Line Backup</h4>
            <button id="btn-export-line" class="st-phone-settings-btn" style="background-color: #007bff;">Export Line History</button>
            <button id="btn-import-line" class="st-phone-settings-btn" style="background-color: #17a2b8;">Import Line History</button>
            <input type="file" id="file-import-line" style="display: none;" accept=".json">
            <hr>
            <button id="btn-test-notification" class="st-phone-settings-btn" style="background-color: #f59e0b;">Test Notification</button>
        </div>
    `;

    // หาตำแหน่งที่จะใส่เมนู (SillyTavern มีแท็บ Extensions)
    const extensionPanel = document.getElementById('extensions_settings');
    if (extensionPanel) {
        const container = document.createElement('div');
        container.innerHTML = settingsHtml;
        extensionPanel.appendChild(container);

        // ผูก Event ให้ปุ่มใน Settings
        document.getElementById('btn-toggle-phone').addEventListener('click', togglePhone);
        document.getElementById('btn-toggle-fab').addEventListener('click', toggleFabVisibility);

        // ปุ่มทดสอบการแจ้งเตือน
        document.getElementById('btn-test-notification').addEventListener('click', () => {
            triggerNotification();
        });
    }

    // Event สำหรับ Export
    document.getElementById('btn-export-line')?.addEventListener('click', () => {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return alert("ไม่มีประวัติแชทให้ Export ครับ");

        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Line_History_Backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Event สำหรับ Import
    document.getElementById('btn-import-line')?.addEventListener('click', () => {
        document.getElementById('file-import-line').click();
    });

    document.getElementById('file-import-line')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const importedData = JSON.parse(event.target.result);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(importedData));
                alert("นำเข้าประวัติแชทสำเร็จ! กรุณารีเฟรชหน้าต่างแชท Line");
                loadLineHistoryForCurrentChar(); // โหลดใหม่ทันที
            } catch (err) {
                alert("ไฟล์ไม่ถูกต้องครับ");
            }
        };
        reader.readAsText(file);
    });
}

function triggerNotification(appId) {
    const fab = document.getElementById('st-phone-fab');
    const mainBadge = document.getElementById('st-phone-badge');
    const appBadge = document.getElementById(`badge-${appId}`);

    if (!isPhoneOpen) {
        fab.classList.add('fab-vibrating');
        mainBadge.style.display = 'block';
        setTimeout(() => fab.classList.remove('fab-vibrating'), 2000);
    }

    // โชว์จุดแดงที่แอปด้วย
    if (appBadge) {
        appBadge.style.display = 'flex';
        // เพิ่มตัวเลขแจ้งเตือน (แบบง่ายๆ)
        appBadge.innerText = "!";
    }
}

// --- ฟังก์ชันทำให้ปุ่มลากได้ (Draggable) ---
function makeDraggable(element) {
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    let active = false;

    // รองรับทั้งเมาส์ (คอม) และนิ้ว (มือถือ)
    element.addEventListener("touchstart", dragStart, { passive: false });
    document.addEventListener("touchend", dragEnd, false);
    document.addEventListener("touchmove", drag, { passive: false });

    element.addEventListener("mousedown", dragStart, false);
    document.addEventListener("mouseup", dragEnd, false);
    document.addEventListener("mousemove", drag, false);

    function dragStart(e) {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }

        // เช็คว่ากดที่ตัวปุ่มจริงๆ
        if (e.target === element || element.contains(e.target)) {
            active = true;
            isDragging = false; // รีเซ็ตสถานะ
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        active = false;

        // หน่วงเวลาเล็กน้อยก่อนรีเซ็ต isDragging เพื่อให้ Event Click ทำงานได้ถูกต้อง
        setTimeout(() => {
            isDragging = false;
        }, 50);
    }

    function drag(e) {
        if (active) {
            e.preventDefault(); // ป้องกันพฤติกรรมแปลกๆ บนมือถือ
            isDragging = true; // ตั้งสถานะว่ากำลังลากอยู่ (จะไม่เปิดโทรศัพท์)

            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            xOffset = currentX;
            yOffset = currentY;

            // อัปเดตตำแหน่งปุ่ม
            setTranslate(currentX, currentY, element);
        }
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }

    // --- ป้องกันปุ่มหายเมื่อย่อ/ขยายหน้าจอ (Window Resize) ---
    window.addEventListener('resize', () => {
        const rect = element.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let needsAdjustment = false;
        let newX = xOffset;
        let newY = yOffset;

        // เช็คว่าปุ่มทะลุขอบขวาหรือล่างไหม
        if (rect.right > winWidth) {
            newX = xOffset - (rect.right - winWidth) - 20; // ถอยกลับมา 20px
            needsAdjustment = true;
        }
        if (rect.bottom > winHeight) {
            newY = yOffset - (rect.bottom - winHeight) - 20;
            needsAdjustment = true;
        }

        // เช็คว่าปุ่มทะลุขอบซ้ายหรือบนไหม
        if (rect.left < 0) {
            newX = xOffset - rect.left + 20;
            needsAdjustment = true;
        }
        if (rect.top < 0) {
            newY = yOffset - rect.top + 20;
            needsAdjustment = true;
        }

        // ถ้าปุ่มตกขอบ ให้เด้งกลับเข้ามาในจอ
        if (needsAdjustment) {
            xOffset = newX;
            yOffset = newY;
            setTranslate(newX, newY, element);
        }
    });
}

// อัปเดตหน้ารายชื่อแชท
function updateLineChatList() {
    const chatListContent = document.getElementById('line-chat-list-content');
    if (!chatListContent) return;

    const context = getContext();
    const charId = context.characterId;
    if (!charId) return;

    const allHistory = getAllLineHistory();
    const charHistory = allHistory[charId] || {}; // ประวัติของบอทตัวนี้

    chatListContent.innerHTML = '';

    // จัดกลุ่มข้อความตามชื่อคนส่ง (senderName)
    const chatRooms = {};

    // ดึงชื่อบอทหลักมาสร้างห้องไว้รอเลย (เผื่อยังไม่เคยคุย)
    const mainCharName = context.name2 || "Character";
    chatRooms[mainCharName] = { lastMsg: "Tap to chat", time: "" };

    // จัดกลุ่มประวัติแชทที่มีอยู่
    if (Array.isArray(charHistory)) {
        charHistory.forEach(msg => {
            const roomName = msg.isMe ? msg.chatRoom : msg.senderName;
            if (roomName) {
                chatRooms[roomName] = { lastMsg: msg.message, time: msg.time };
            }
        });
    }

    // สร้าง UI สำหรับแต่ละห้องแชท
    Object.keys(chatRooms).forEach(roomName => {
        const roomData = chatRooms[roomName];
        const avatarUrl = getAvatarUrl(false, roomName); // ดึงรูป (ถ้าเป็น NPC จะได้รูป default)

        const roomDiv = document.createElement('div');
        roomDiv.style.cssText = "display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #f1f1f1; cursor: pointer;";
        roomDiv.innerHTML = `
            <div class="line-avatar" style="background-image: url('${avatarUrl}'); width: 50px; height: 50px; margin-right: 15px;"></div>
            <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: bold; font-size: 16px; color: #333;">${roomName}</div>
                <div style="color: #888; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${roomData.lastMsg}</div>
            </div>
            <div style="color: #aaa; font-size: 11px;">${roomData.time}</div>
        `;

        // เมื่อกดที่รายชื่อ ให้เปิดห้องแชทนั้น
        roomDiv.addEventListener('click', () => {
            openLineChatRoom(roomName);
        });

        chatListContent.appendChild(roomDiv);
    });
}

// เปิดหน้าห้องแชท
function openLineChatRoom(roomName) {
    currentActiveLineChat = roomName;
    document.getElementById('line-chat-list-view').style.display = 'none';
    document.getElementById('line-chat-room-view').style.display = 'flex';
    document.getElementById('line-chat-title').innerText = roomName;

    // โหลดประวัติแชทเฉพาะของคนนี้
    const contentLine = document.getElementById('content-line');
    contentLine.innerHTML = '';

    const context = getContext();
    const allHistory = getAllLineHistory();
    const charHistory = allHistory[context.characterId] || [];

    charHistory.forEach(msg => {
        const targetRoom = msg.isMe ? msg.chatRoom : msg.senderName;
        if (targetRoom === roomName) {
            renderMessageToUI(msg.senderName, msg.message, msg.isMe, msg.time);
        }
    });
}

// ผูก Event ให้ปุ่ม Back ในหน้าแชท
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-back-to-chatlist') {
        currentActiveLineChat = "";
        document.getElementById('line-chat-room-view').style.display = 'none';
        document.getElementById('line-chat-list-view').style.display = 'flex';
        updateLineChatList(); // อัปเดตรายชื่อเผื่อมีข้อความใหม่
    }
});

// --- ระบบแอปโทรศัพท์ (Phone Logic) ---
let currentCallerName = "";
let isCallActive = false;
let callTimerInterval;
let callSeconds = 0;

// เมื่อมีสายเข้า
function triggerIncomingCall(callerName) {
    currentCallerName = callerName;
    const avatarUrl = getAvatarUrl(false, callerName);

    // อัปเดต UI หน้าสายเรียกเข้า
    document.getElementById('incoming-name').innerText = callerName;
    document.getElementById('incoming-avatar').style.backgroundImage = `url('${avatarUrl}')`;

    // สลับหน้าจอไปที่สายเรียกเข้า
    document.getElementById('phone-incoming-view').style.display = 'flex';
    document.getElementById('phone-active-view').style.display = 'none';

    // เปิดแอปโทรศัพท์ขึ้นมาอัตโนมัติ (เด้งขึ้นมาเลยเพื่อให้รู้ว่ามีสายเข้า)
    if (!isPhoneOpen) togglePhone();
    openApp('phone', 'Phone');
}

// กดรับสาย
window.acceptCall = function() {
    isCallActive = true;
    const avatarUrl = getAvatarUrl(false, currentCallerName);

    // อัปเดต UI หน้าคุยสาย
    document.getElementById('active-name').innerText = currentCallerName;
    document.getElementById('active-avatar').style.backgroundImage = `url('${avatarUrl}')`;
    document.getElementById('phone-transcript').innerHTML = '<div style="text-align: center; color: #888; font-size: 12px; margin-top: 10px;">Call connected.</div>';

    // สลับหน้าจอ
    document.getElementById('phone-incoming-view').style.display = 'none';
    document.getElementById('phone-active-view').style.display = 'flex';

    // เริ่มจับเวลา
    callSeconds = 0;
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        document.getElementById('active-timer').innerText = `${mins}:${secs}`;
    }, 1000);

    // ส่ง Prompt เบื้องหลังบอก AI ว่าเรารับสายแล้ว
    sendHiddenPrompt(`[System: ผู้ใช้กดรับสายโทรศัพท์จาก ${currentCallerName} แล้ว กรุณาเริ่มพูดคุยผ่านโทรศัพท์]`);
};

// กดตัดสาย
window.declineCall = function() {
    // ปิดแอป
    document.getElementById('window-phone').style.display = 'none';

    // ส่ง Prompt บอก AI ว่าเราตัดสาย
    sendHiddenPrompt(`[System: ผู้ใช้กดตัดสายโทรศัพท์จาก ${currentCallerName}]`);
};

// กดวางสาย (เมื่อคุยเสร็จ)
window.endCall = function() {
    isCallActive = false;
    clearInterval(callTimerInterval);
    document.getElementById('window-phone').style.display = 'none';
    sendHiddenPrompt(`[System: ผู้ใช้วางสายโทรศัพท์แล้ว]`);
};

// พิมพ์ตอบกลับระหว่างคุยสาย
window.sendPhoneMessage = function() {
    const input = document.getElementById('phone-input');
    const text = input.value.trim();
    if (text && isCallActive) {
        // โชว์ในหน้าจอโทรศัพท์
        addTranscriptMessage(text, true);
        // ส่งหา AI
        sendHiddenPrompt(`[Phone: ${text}]`);
        input.value = "";
    }
};

// เพิ่มซับไตเติ้ลคำพูดในหน้าจอโทรศัพท์
function addTranscriptMessage(message, isMe) {
    const transcript = document.getElementById('phone-transcript');
    const msgDiv = document.createElement('div');
    msgDiv.className = `transcript-msg ${isMe ? 'transcript-me' : 'transcript-other'}`;
    msgDiv.innerText = message;
    transcript.appendChild(msgDiv);
    transcript.scrollTop = transcript.scrollHeight;
}

// ฟังก์ชันตัวช่วยสำหรับส่งข้อความเบื้องหลัง
function sendHiddenPrompt(promptText) {
    const stTextarea = document.getElementById('send_textarea');
    const stSendBtn = document.getElementById('send_but');
    if (stTextarea && stSendBtn) {
        stTextarea.value = promptText;
        stTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        stSendBtn.click();
    }
}

// --- ระบบแอป Music (Player Logic) ---
window.playMusicTrack = function(url) {
    const playerFrame = document.getElementById('music-player-frame');
    const statusText = document.getElementById('music-now-playing');
    const discAnim = document.getElementById('music-disc-anim');

    if (!playerFrame) return;

    let embedUrl = "";
    let platform = "";

    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    const spotifyMatch = url.match(/spotify\.com\/(track|playlist|album)\/([\w\d]+)/);

    if (ytMatch && ytMatch[1]) {
        embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0`; // แนะนำให้ปิด autoplay ก่อนเผื่อเบราว์เซอร์บล็อก
        platform = "YouTube";
    } else if (spotifyMatch && spotifyMatch[1] && spotifyMatch[2]) {
        embedUrl = `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}?utm_source=generator`;
        platform = "Spotify";
    }

    if (embedUrl) {
        playerFrame.innerHTML = `<iframe src="${embedUrl}" width="100%" height="100%" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
        statusText.innerHTML = `🎵 Shared via <b>${platform}</b>`;
        discAnim.classList.add('playing');
        triggerNotification('music');
    } else {
        console.log("📱 Music App: ไม่รองรับลิงก์นี้ ->", url);
    }
};

// --- ระบบแอป Settings (Personalization) ---

// โหลดการตั้งค่าเดิมเมื่อเปิดแอป
function loadPhoneSettings() {
    const savedColor = localStorage.getItem('st_phone_color') || '#333333';
    const savedWallpaper = localStorage.getItem('st_phone_wallpaper') || 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=400&auto=format&fit=crop';

    // อัปเดต UI ในหน้า Settings
    const colorInput = document.getElementById('setting-phone-color');
    const wpInput = document.getElementById('setting-wallpaper-url');
    if (colorInput) colorInput.value = savedColor;
    if (wpInput) wpInput.value = savedWallpaper;

    // นำไปใช้กับโทรศัพท์
    document.getElementById('st-phone-container').style.borderColor = savedColor;
    document.getElementById('st-phone-home').style.backgroundImage = `url('${savedWallpaper}')`;
}

// กดปุ่ม Apply Changes
window.applyPhoneSettings = function() {
    const newColor = document.getElementById('setting-phone-color').value;
    const newWallpaper = document.getElementById('setting-wallpaper-url').value;

    if (newWallpaper) {
        localStorage.setItem('st_phone_wallpaper', newWallpaper);
        document.getElementById('st-phone-home').style.backgroundImage = `url('${newWallpaper}')`;
    }

    localStorage.setItem('st_phone_color', newColor);
    document.getElementById('st-phone-container').style.borderColor = newColor;

    alert("Phone settings applied!");
};

// ฟังก์ชันอัปโหลดและแปลงไฟล์ Wallpaper เป็น Base64
window.handleWallpaperUpload = function(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        alert("ไฟล์ใหญ่เกินไปครับ กรุณาใช้รูปภาพขนาดไม่เกิน 2MB");
        inputElement.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        // ใส่ Base64 ลงในช่อง URL และเปลี่ยน Wallpaper ทันที
        document.getElementById('setting-wallpaper-url').value = e.target.result;
        applyPhoneSettings();
        inputElement.value = ""; // ล้างค่าเผื่อเลือกไฟล์เดิมซ้ำ
    };
    reader.readAsDataURL(file);
};

// --- แก้ไข: ฟังก์ชันพรีวิว Sticker/IG ---
let tempImageBase64 = "";

window.previewImageFile = function(inputElement) {
    const file = inputElement.files[0];
    const previewContainer = document.getElementById('image-preview-container');
    const previewImg = document.getElementById('image-preview-img');

    if (!file) {
        previewContainer.style.display = 'none';
        tempImageBase64 = "";
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        alert("ไฟล์ใหญ่เกินไปครับ กรุณาใช้รูปภาพขนาดไม่เกิน 2MB");
        inputElement.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        tempImageBase64 = e.target.result;
        previewImg.src = tempImageBase64;
        previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
};

// ฟังก์ชัน 2: บันทึกลงฐานข้อมูลเมื่อกดปุ่ม Save
window.uploadImageToDB = function() {
    const type = document.getElementById('image-upload-type').value;
    const keyword = document.getElementById('image-keyword').value.trim();
    const fileInput = document.getElementById('image-file-input');

    if (!tempImageBase64) {
        alert("กรุณาเลือกไฟล์รูปภาพก่อนครับ");
        return;
    }

    if (!keyword) {
        alert("กรุณากรอก Keyword ก่อนบันทึกครับ");
        return;
    }

    const safeKeyword = keyword.replace(/\s+/g, '_').toLowerCase();
    const id = `${type}_${safeKeyword}`;

    const transaction = imageDB.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const imageData = {
        id: id,
        type: type,
        keyword: safeKeyword,
        data: tempImageBase64
    };

    const request = store.put(imageData);
    request.onsuccess = function() {
        alert(`บันทึก ${type} [${safeKeyword}] สำเร็จ!`);

        // ล้างค่าทั้งหมดหลังเซฟเสร็จ เพื่อเตรียมรับรูปใหม่
        document.getElementById('image-keyword').value = "";
        fileInput.value = "";
        document.getElementById('image-preview-container').style.display = 'none';
        tempImageBase64 = "";

        loadSavedImages(); // รีเฟรชลิสต์ด้านล่าง
    };
};

// โหลดรูปภาพทั้งหมดมาแสดงใน Settings
function loadSavedImages() {
    if (!imageDB) return;

    const transaction = imageDB.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = function(event) {
        const images = event.target.result;
        const container = document.getElementById('sticker-list-container');
        if (!container) return;

        if (images.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #888; font-size: 12px;">No images saved yet.</div>';
            return;
        }

        container.innerHTML = ''; // ล้างของเก่า
        images.forEach(img => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'saved-image-item';
            itemDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${img.data}" class="saved-image-preview">
                    <div>
                        <div style="font-weight: bold; font-size: 12px;">${img.keyword}</div>
                        <div style="font-size: 10px; color: #888; text-transform: uppercase;">${img.type}</div>
                    </div>
                </div>
                <button class="settings-btn settings-btn-danger" style="padding: 5px 8px; font-size: 12px;" onclick="deleteImageFromDB('${img.id}')">Delete</button>
            `;
            container.appendChild(itemDiv);
        });
    };
}

// ลบรูปภาพออกจากฐานข้อมูล
window.deleteImageFromDB = function(id) {
    if (!confirm("ต้องการลบรูปภาพนี้ใช่ไหม?")) return;

    const transaction = imageDB.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);

    transaction.oncomplete = function() {
        loadSavedImages();
    };
};

// ดึงรูปสติกเกอร์จาก DB มาแสดงแทน Placeholder
function fetchAndRenderSticker(keyword) {
    if (!imageDB) return;

    const transaction = imageDB.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(`sticker_${keyword}`);

    request.onsuccess = function(event) {
        const result = event.target.result;

        // ค้นหา Placeholder ทั้งหมดที่รอสติกเกอร์ตัวนี้อยู่
        const placeholders = document.querySelectorAll(`.st-async-sticker[data-keyword="${keyword}"]`);

        placeholders.forEach(el => {
            if (result && result.data) {
                // ถ้ารูปมีในระบบ ให้เปลี่ยนเป็นแท็ก <img>
                el.outerHTML = `<img src="${result.data}" style="max-width: 150px; max-height: 150px; border-radius: 10px; background-color: transparent;">`;
            } else {
                // ถ้าไม่มีรูปในระบบ
                el.innerText = `[Sticker not found: ${keyword}]`;
                el.style.backgroundColor = "#ffdddd";
            }
        });
    };
}

// --- ระบบแอป Instagram ---

window.createIGPost = function(source, keyword, caption) {
    const contentIG = document.getElementById('content-ig');
    if (!contentIG) return;

    // ลบข้อความ "No posts yet" ออกถ้ามี
    if (contentIG.innerHTML.includes("No posts yet.")) {
        contentIG.innerHTML = '';
    }

    const context = getContext();
    const sender = context.name2 || "Unknown";
    const avatarUrl = getAvatarUrl(false, sender);
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // สร้าง Element ของโพสต์
    const postDiv = document.createElement('div');
    postDiv.className = 'ig-post';

    // โครงสร้างเริ่มต้น (ยังไม่มีรูป)
    postDiv.innerHTML = `
        <div class="ig-post-header">
            <div class="ig-avatar" style="background-image: url('${avatarUrl}');"></div>
            <div class="ig-username">${sender}</div>
        </div>
        <div class="ig-image-container" id="ig-img-container-${Date.now()}">
            <div style="color: #888; font-size: 12px;">Loading image...</div>
        </div>
        <div class="ig-actions">
            <div class="ig-action-icon" onclick="this.classList.toggle('liked'); this.innerText = this.classList.contains('liked') ? '❤️' : '🤍'">🤍</div>
            <div class="ig-action-icon">💬</div>
            <div class="ig-action-icon">✈️</div>
        </div>
        <div class="ig-caption-area">
            <span class="ig-username">${sender}</span> ${caption}
            <div class="ig-time">${timeString}</div>
        </div>
        <div class="ig-comment-input-area">
            <input type="text" class="ig-comment-input" placeholder="Add a comment...">
            <div class="ig-comment-btn" onclick="sendIGComment(this, '${sender}')">Post</div>
        </div>
    `;

    // แทรกโพสต์ใหม่ไว้บนสุด
    contentIG.insertBefore(postDiv, contentIG.firstChild);

    // จัดการรูปภาพตาม Source (web หรือ local)
    const imgContainer = postDiv.querySelector('.ig-image-container');

    if (source === 'web') {
        // ใช้เว็บสุ่มรูปฟรี (LoremFlickr) โดยใช้ keyword
        const cleanKeyword = keyword.replace(/\s+/g, ','); // เปลี่ยนช่องว่างเป็นลูกน้ำ
        const randomNum = Math.floor(Math.random() * 1000); // ป้องกันภาพซ้ำแคช
        const imageUrl = `https://loremflickr.com/400/400/${cleanKeyword}?random=${randomNum}`;

        imgContainer.innerHTML = `<img src="${imageUrl}" class="ig-image" onerror="this.src='https://via.placeholder.com/400?text=Image+Not+Found'">`;
    }
    else if (source === 'local') {
        // ดึงรูปจาก IndexedDB
        if (imageDB) {
            const cleanKeyword = keyword.trim().toLowerCase();
            const transaction = imageDB.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`ig_${cleanKeyword}`);

            request.onsuccess = function(event) {
                const result = event.target.result;
                if (result && result.data) {
                    imgContainer.innerHTML = `<img src="${result.data}" class="ig-image">`;
                } else {
                    imgContainer.innerHTML = `<div style="color: red; padding: 20px;">[Local Image Not Found: ${keyword}]</div>`;
                }
            };
        } else {
            imgContainer.innerHTML = `<div style="color: red; padding: 20px;">[Database Not Ready]</div>`;
        }
    }
};

// อัปเดตหน้าประวัติการโทร
function updatePhoneHistoryUI() {
    const context = getContext();
    const charName = context.name2 || "Character";
    const avatarUrl = getAvatarUrl(false, charName);

    const nameEl = document.getElementById('history-name');
    const avatarEl = document.getElementById('history-avatar');

    if (nameEl) nameEl.innerText = charName;
    if (avatarEl) avatarEl.style.backgroundImage = `url('${avatarUrl}')`;
}

// ผู้ใช้กดโทรออกหาบอท
window.makeOutgoingCall = function() {
    const context = getContext();
    currentCallerName = context.name2 || "Character";
    const avatarUrl = getAvatarUrl(false, currentCallerName);

    // ตั้งค่า UI แบบเต็มจอ
    document.getElementById('incoming-name').innerText = currentCallerName;
    document.getElementById('incoming-status').innerText = "Calling...";
    document.getElementById('incoming-avatar').style.backgroundImage = `url('${avatarUrl}')`;
    document.getElementById('incoming-bg').style.backgroundImage = `url('${avatarUrl}')`;

    // ซ่อนปุ่มรับสาย (เพราะเราเป็นคนโทร)
    document.getElementById('btn-accept-call').style.display = 'none';

    document.getElementById('phone-history-view').style.display = 'none';
    document.getElementById('phone-incoming-view').style.display = 'flex';

    // ส่ง Prompt หา AI
    sendHiddenPrompt(`[System: ผู้ใช้กำลังโทรศัพท์หาคุณ กรุณารับสายโดยพิมพ์ [Call: รับสาย] หรือตัดสายโดยพิมพ์ [Call: ตัดสาย]]`);
};

// ปรับปรุงฟังก์ชันรับสาย (UI เต็มจอ)
window.acceptCall = function() {
    isCallActive = true;
    const avatarUrl = getAvatarUrl(false, currentCallerName);

    document.getElementById('active-name').innerText = currentCallerName;
    document.getElementById('active-small-avatar').style.backgroundImage = `url('${avatarUrl}')`;
    document.getElementById('active-bg').style.backgroundImage = `url('${avatarUrl}')`; // พื้นหลังเต็มจอ
    document.getElementById('phone-transcript').innerHTML = '';

    document.getElementById('phone-incoming-view').style.display = 'none';
    document.getElementById('phone-active-view').style.display = 'flex';

    callSeconds = 0;
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        document.getElementById('active-timer').innerText = `${mins}:${secs}`;
    }, 1000);

    sendHiddenPrompt(`[System: ผู้ใช้กดรับสายโทรศัพท์จาก ${currentCallerName} แล้ว กรุณาเริ่มพูดคุยผ่านโทรศัพท์]`);
};

let tempMyIGBase64 = "";

window.previewMyIGImage = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        tempMyIGBase64 = e.target.result;
        document.getElementById('ig-my-preview').src = tempMyIGBase64;
        document.getElementById('ig-my-preview').style.display = 'block';
        document.getElementById('ig-my-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
};

window.postMyIG = function() {
    const caption = document.getElementById('ig-my-caption').value;
    const hiddenContext = document.getElementById('ig-my-hidden-context').value;

    if (!tempMyIGBase64) return alert("Please select an image.");

    // โชว์ในฟีดของตัวเอง
    const context = getContext();
    const myName = context.name1 || "Me";

    // สร้างโพสต์แบบพิเศษสำหรับผู้ใช้
    const contentIG = document.getElementById('content-ig');
    if (contentIG.innerHTML.includes("No posts yet.")) contentIG.innerHTML = '';

    const postDiv = document.createElement('div');
    postDiv.className = 'ig-post';
    postDiv.innerHTML = `
        <div class="ig-post-header">
            <div class="ig-avatar" style="background-image: url('${getAvatarUrl(true, myName)}');"></div>
            <div class="ig-username">${myName}</div>
        </div>
        <div class="ig-image-container"><img src="${tempMyIGBase64}" class="ig-image"></div>
        <div class="ig-caption-area" style="margin-top: 10px;">
            <span class="ig-username">${myName}</span> ${caption}
        </div>
    `;
    contentIG.insertBefore(postDiv, contentIG.firstChild);

    // ส่ง Prompt หา AI
    const prompt = `[IG ของ ${myName}: แคปชั่น "${caption}" | ข้อมูลภาพสำหรับ AI: ${hiddenContext}]`;
    sendHiddenPrompt(prompt);

    // ปิด Modal และเคลียร์ค่า
    document.getElementById('ig-upload-modal').style.display = 'none';
    tempMyIGBase64 = "";
    document.getElementById('ig-my-preview').style.display = 'none';
    document.getElementById('ig-my-placeholder').style.display = 'block';
    document.getElementById('ig-my-caption').value = "";
    document.getElementById('ig-my-hidden-context').value = "";
};

// ฟังก์ชันส่งคอมเมนต์ IG
window.sendIGComment = function(btnElement, postOwner) {
    const input = btnElement.previousElementSibling;
    const text = input.value.trim();
    if (text) {
        // ส่ง Prompt คอมเมนต์
        sendHiddenPrompt(`[IG Comment ถึง ${postOwner}: ${text}]`);
        input.value = "";
        alert("Comment sent!");
    }
};

// เรียกใช้ฟังก์ชันนี้ตอนโหลด Extension เพื่อตั้งค่าสีและวอลเปเปอร์เริ่มต้น
jQuery(async () => {
    console.log("📱 ST Virtual Phone Loaded!");
    createPhoneUI();
    setupSettingsMenu();
    setupMessageHook();
    loadPhoneSettings();
    initImageDB();

    // โหลดประวัติแชท Line และหน้า Phone History มารอไว้เลย
    setTimeout(() => {
        updateLineChatList();
        updatePhoneHistoryUI();
    }, 1000);
});
