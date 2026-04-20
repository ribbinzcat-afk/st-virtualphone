import { getContext } from "../../../extensions.js";
// นำเข้า eventSource จากระบบหลักของ SillyTavern เพื่อดักจับข้อความ
import { eventSource, event_types } from "../../../../script.js";

// --- ระบบจัดการประวัติแชท (Local Storage) ---
const STORAGE_KEY = 'st_virtualphone_line_history';

// --- ระบบจัดการประวัติ IG (Local Storage) ---
const IG_STORAGE_KEY = 'st_virtualphone_ig_history';

// โหลดประวัติ IG ทั้งหมด
function getAllIGHistory() {
    const data = localStorage.getItem(IG_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

// โหลดประวัติ IG มาแสดงบนหน้าจอ
function loadIGHistoryForCurrentChar() {
    const context = getContext();
    const charId = context.characterId;
    if (!charId) return;

    const allHistory = getAllIGHistory();
    const charPosts = allHistory[charId] || [];

    const contentIG = document.getElementById('content-ig');
    if (!contentIG) return;

    // ล้างหน้าจอเดิม
    contentIG.innerHTML = '';

    if (charPosts.length === 0) {
        contentIG.innerHTML = '<div id="ig-empty-state" style="text-align: center; padding: 20px; color: #888;">No posts yet.</div>';
        return;
    }

    // นำประวัติมาแสดง (เรียงจากโพสต์ล่าสุดไปเก่าสุด)
    charPosts.forEach(post => {
        renderIGPostUI_FromHistory(post);
    });
}

// บันทึกโพสต์ใหม่ลง Storage
function saveIGPostToStorage(postData) {
    const context = getContext();
    const charId = context.characterId;
    if (!charId) return;

    const allHistory = getAllIGHistory();
    if (!allHistory[charId]) {
        allHistory[charId] = [];
    }

    // เพิ่มโพสต์ใหม่ไว้บนสุด
    allHistory[charId].unshift(postData);
    localStorage.setItem(IG_STORAGE_KEY, JSON.stringify(allHistory));
}

// บันทึกคอมเมนต์ลงในโพสต์ที่มีอยู่
function saveIGCommentToStorage(postId, commentData) {
    const context = getContext();
    const charId = context.characterId;
    if (!charId) return;

    const allHistory = getAllIGHistory();
    if (!allHistory[charId]) return;

    // หาโพสต์ที่ตรงกับ postId
    const postIndex = allHistory[charId].findIndex(p => p.postId === postId);
    if (postIndex !== -1) {
        if (!allHistory[charId][postIndex].comments) {
            allHistory[charId][postIndex].comments = [];
        }
        // เพิ่มคอมเมนต์ต่อท้าย
        allHistory[charId][postIndex].comments.push(commentData);
        localStorage.setItem(IG_STORAGE_KEY, JSON.stringify(allHistory));
    }
}

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
    { id: 'twitter', name: 'Twitter', icon: '🐦', color: '#1DA1F2' }, 
    { id: 'settings', name: 'Settings', icon: '⚙️', color: '#8E8E93' }
];


function createPhoneUI() {
    try {
        // 1. สร้าง Floating Button
        const fab = document.createElement('div');
        fab.id = 'st-phone-fab';
        fab.innerHTML = `📱<div id="st-phone-badge" style="display:none;"></div>`;
        document.body.appendChild(fab);

        // ทำให้ปุ่มลากได้
        makeDraggable(fab);

        // 2. สร้างกรอบโทรศัพท์
        const phoneContainer = document.createElement('div');
        phoneContainer.id = 'st-phone-container';

        const screen = document.createElement('div');
        screen.id = 'st-phone-screen';

        const homeScreen = document.createElement('div');
        homeScreen.id = 'st-phone-home';

        // เพิ่มปุ่ม X สำหรับปิดโทรศัพท์ที่หน้า Home
        const closeBtn = document.createElement('div');
        closeBtn.className = 'st-close-phone-btn';
        closeBtn.innerHTML = '✖';
        closeBtn.onclick = togglePhone;
        homeScreen.appendChild(closeBtn);

        // 3. สร้างไอคอนแอปลงใน Home Screen
        apps.forEach(app => {
            const appIcon = document.createElement('div');
            appIcon.className = 'st-app-icon';
            appIcon.innerHTML = `
                <div class="st-app-icon-img" style="color: ${app.color};">${app.icon}</div>
                <div class="st-app-badge" id="badge-${app.id}">!</div>
                <div class="st-app-icon-name">${app.name}</div>
            `;
            appIcon.addEventListener('click', () => openApp(app.id, app.name));
            homeScreen.appendChild(appIcon);
        });

        screen.appendChild(homeScreen);

        // 4. สร้างหน้าต่างแอปต่างๆ
        apps.forEach(app => {
            const appWindow = document.createElement('div');
            appWindow.id = `window-${app.id}`;
            appWindow.className = 'st-app-window';
            appWindow.style.display = 'none'; // ซ่อนไว้ก่อน

        if (app.id === 'line') {
            // --- โครงสร้างแอป LINE (อัปเดตมีหน้ารวมแชท) ---
            appWindow.innerHTML = `
                <!-- หน้า 1: หน้ารวมแชท (Chat List) -->
                <div id="line-chat-list-view" style="display: flex; flex-direction: column; height: 100%;">
                    <div class="st-app-header">
                        <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                        <div>Chats</div>
                        <div class="line-header-icons">⚙️</div>
                    </div>
                    <div class="st-app-content" id="line-chat-list-content" style="padding: 0; background-color: #fff;">
                        <!-- รายชื่อแชทจะถูกสร้างที่นี่ -->
                    </div>
                </div>

                <!-- หน้า 2: หน้าห้องแชทส่วนตัว (Chat Room) -->
                <div id="line-chat-room-view" style="display: none; flex-direction: column; height: 100%;">
                    <div class="st-app-header">
                        <div class="st-back-btn" id="btn-back-to-chatlist">❮</div>
                        <div id="line-chat-title">Name</div>
                        <div class="line-header-icons">📞 ≡</div>
                    </div>
                    <div class="st-app-content" id="content-line">
                        <!-- บับเบิลแชทจะมาโผล่ที่นี่ -->
                    </div>
                    <div class="line-input-area">
                        <div class="line-icon-btn">＋</div>
                        <div class="line-icon-btn">📷</div>
                        <div class="line-icon-btn">😊</div>
                        <input type="text" class="line-input-field" id="line-input" placeholder="Aa">
                        <div class="line-icon-btn" id="line-mic-icon">🎤</div>
                        <div class="line-send-btn" id="line-send-btn">Send</div>
                    </div>
                </div>
            `;
                } else if (app.id === 'phone') {
            appWindow.innerHTML = `
                <!-- หน้า 1: ประวัติการโทร (Call History) -->
                <div id="phone-history-view">
                    <div class="st-app-header" style="background-color: #1c1c1e; border-bottom: 1px solid #333;">
                        <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                        <div>Phone</div>
                        <div style="width: 20px;"></div>
                    </div>
                    <div class="st-app-content" style="padding: 0;">
                        <div class="call-btn-large" onclick="initiateCallOut()">📞 Call Current Character</div>
                        <div style="padding: 15px; color: #888; font-size: 14px;">Recent Calls</div>
                        <div id="call-history-list">
                            <!-- ประวัติการโทรจะมาโชว์ตรงนี้ -->
                        </div>
                    </div>
                </div>

                <!-- หน้า 2: สายเรียกเข้า (Incoming Call) เหมือนเดิม -->
                <div id="phone-incoming-view" style="display: none; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center;">
                    <div class="phone-large-avatar" id="incoming-avatar"></div>
                    <div class="phone-caller-name" id="incoming-name">Unknown</div>
                    <div class="phone-status-text">Incoming Call...</div>
                    <div class="phone-action-buttons">
                        <div class="phone-btn phone-btn-decline" onclick="declineCall()">📴</div>
                        <div class="phone-btn phone-btn-accept" onclick="acceptCall()">📞</div>
                    </div>
                </div>

                <!-- หน้า 3: กำลังคุยสาย (Active Call) อัปเกรด UI -->
                <div id="phone-active-view">
                    <div class="active-call-overlay"></div>
                    <div class="active-call-content">
                        <div class="active-call-header">
                            <div class="active-call-avatar" id="active-avatar"></div>
                            <div style="font-weight: bold; font-size: 22px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);" id="active-name">Name</div>
                            <div class="active-call-timer" id="active-timer">Calling...</div>
                        </div>
                        <div id="phone-transcript"></div>
                        <div style="display: flex; padding: 10px; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px);">
                            <input type="text" id="phone-input" placeholder="Speak..." style="flex: 1; border: none; border-radius: 20px; padding: 10px 15px; background-color: #2c2c2e; color: white; outline: none;">
                            <div style="color: #007aff; padding: 10px; font-weight: bold; cursor: pointer;" onclick="sendPhoneMessage()">Send</div>
                        </div>
                        <div class="active-call-controls" style="background: rgba(0,0,0,0.8);">
                            <div class="call-control-btn end-call" onclick="endCall()">📴</div>
                        </div>
                    </div>
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
                } else if (app.id === 'ig') {
            // --- โครงสร้างแอป INSTAGRAM (อัปเกรด) ---
            appWindow.innerHTML = `
                <!-- หน้าฟีดหลัก -->
                <div class="st-app-header">
                    <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                    <div style="font-weight: bold; font-family: 'Comic Sans MS', cursive;">Instagram</div>
                    <div class="line-header-icons" style="cursor:pointer;" onclick="openIGCreatePost()">➕</div>
                </div>
                <div class="st-app-content" id="content-ig" style="padding: 0; background-color: #fff;">
                    <div id="ig-empty-state" style="text-align: center; padding: 20px; color: #888;">No posts yet.</div>
                </div>

                <!-- หน้าต่างสร้างโพสต์ใหม่ -->
                <div id="ig-create-post-modal">
                    <div class="ig-create-header">
                        <div class="ig-create-btn cancel" onclick="closeIGCreatePost()">Cancel</div>
                        <div>New Post</div>
                        <div class="ig-create-btn" onclick="submitIGPost()">Share</div>
                    </div>
                    <div class="ig-create-content">
                        <input type="file" id="ig-upload-input" accept="image/*" style="display: none;" onchange="previewIGUpload(this)">
                        <div class="ig-upload-preview" id="ig-upload-preview" onclick="document.getElementById('ig-upload-input').click()">
                            <div style="color: #888;">Tap to select image</div>
                        </div>
                        <textarea id="ig-caption-input" class="ig-textarea" placeholder="Write a caption... (AI จะเห็นข้อความนี้)"></textarea>
                        <textarea id="ig-hidden-desc-input" class="ig-textarea" placeholder="Image Description (อธิบายรูปให้ AI ฟัง แต่ไม่โชว์หน้าจอ)"></textarea>
                    </div>
                </div>
            `;
        } else if (app.id === 'twitter') {
            appWindow.innerHTML = `
                <div class="st-app-header">
                    <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                    <div>Twitter</div>
                    <div style="width: 20px;"></div>
                </div>

                <!-- พื้นที่สำหรับเลื่อนดูทวีต -->
                <div class="st-app-content" id="content-twitter" style="padding: 0; background-color: #000;">
                    <div id="tw-empty-state" style="text-align: center; padding: 20px; color: #71767b;">No tweets yet.</div>
                    <!-- ทวีตจะมาโผล่ที่นี่ -->
                </div>

                <!-- ปุ่มสร้างทวีต (ย้ายออกมาอยู่นอกพื้นที่เลื่อน) -->
                <div class="tw-fab-create" onclick="openTwitterCreate()">➕</div>

                <!-- หน้าต่างสร้างทวีต -->
                <div id="tw-create-modal">
                    <div class="tw-create-header">
                        <div style="cursor: pointer; color: white;" onclick="closeTwitterCreate()">Cancel</div>
                        <div class="tw-reply-btn" onclick="submitTwitterPost()">Post</div>
                    </div>
                    <textarea id="tw-input" class="tw-textarea" placeholder="What's happening?"></textarea>
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

        // 5. นำกรอบโทรศัพท์ทั้งหมดไปแปะลงบนหน้าจอ ST (บรรทัดนี้สำคัญมาก!)
        document.body.appendChild(phoneContainer);

        console.log("📱 Phone UI Created Successfully!");

    } catch (error) {
        console.error("❌ Error creating Phone UI:", error);
    }

// อัปเดต Event Click: เปิดโทรศัพท์ก็ต่อเมื่อ "ไม่ได้กำลังลาก"
//   fab.addEventListener('click', (e) => {
//      if (!isDragging) {
//         togglePhone();
//     }
//  });

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

// --- ระบบ Regex Hook ดักจับข้อความจาก AI (แก้บั๊กน้องขยันทำซ้ำ) ---
function setupMessageHook() {
    setInterval(() => {
        const messages = document.querySelectorAll('.mes_text');

        messages.forEach(msgElement => {
            const currentHtml = msgElement.innerHTML;
            if (msgElement.dataset.lastProcessedHtml === currentHtml) return;

            let text = currentHtml;
            let originalText = text;
            let hasNotification = false;

            // สร้างสมุดจดบันทึกของแต่ละข้อความ ว่าเคยดึงอันไหนไปแล้วบ้าง
            let processedMatches = msgElement.dataset.processedMatches ? JSON.parse(msgElement.dataset.processedMatches) : [];

            // 1. Line
            text = text.replace(/\[Line[:|]\s*(.*?)(?:\|(.*?))?\]/gi, (match, p1, p2) => {
                if (!processedMatches.includes(match)) {
                    const sender = p2 ? p1.trim() : (getContext().name2 || "Unknown");
                    const message = p2 ? p2.trim() : p1.trim();
                    saveLineMessage(sender, message, false, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                    if (currentActiveLineChat === sender) {
                        renderMessageToUI(sender, message, false, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                    }
                    updateLineChatList();
                    hasNotification = true; triggerNotification('line');
                    processedMatches.push(match); // จดไว้ว่าทำแล้ว
                }
                return `<span style="display:none;">${match}</span>`;
            });

            // 1.5 Sticker
            text = text.replace(/\[Sticker[:|]\s*(.*?)\]/gi, (match, keyword) => {
                if (!processedMatches.includes(match)) {
                    const cleanKeyword = keyword.trim().toLowerCase();
                    const sender = getContext().name2 || "Unknown";
                    const stickerHtml = `<div class="st-async-sticker" data-keyword="${cleanKeyword}" style="width: 120px; height: 120px; background-color: #eee; border-radius: 10px; display: flex; justify-content: center; align-items: center; font-size: 10px; color: #888;">Loading...</div>`;
                    addMessageToLineUI(sender, stickerHtml, false);
                    fetchAndRenderSticker(cleanKeyword);
                    hasNotification = true; triggerNotification('line');
                    processedMatches.push(match);
                }
                return `<span style="display:none;">${match}</span>`;
            });

            // 2. Phone (Call)
            text = text.replace(/\[Call[:|]\s*(.*?)\]/gi, (match, caller) => {
                if (!processedMatches.includes(match)) {
                    const callerName = caller.trim() || (getContext().name2 || "Unknown");
                    setTimeout(() => triggerIncomingCall(callerName), 500);
                    hasNotification = true;
                    processedMatches.push(match);
                }
                return `<span style="display:none;">${match}</span>`;
            });

            // 3. Phone (Active)
            text = text.replace(/\[Phone(?:\|(.*?))?[:|]\s*(.*?)\]/gi, (match, sender, message) => {
                if (!processedMatches.includes(match)) {
                    if (isCallActive) {
                        addTranscriptMessage(message.trim(), false);
                        hasNotification = true;
                        processedMatches.push(match);
                    }
                }
                return isCallActive ? `<span style="display:none;">${match}</span>` : match;
            });

            // 4. Music
            text = text.replace(/\[Music[:|]\s*(https?:\/\/[^\s\]]+)\]/gi, (match, url) => {
                if (!processedMatches.includes(match)) {
                    playMusicTrack(url.trim());
                    hasNotification = true; triggerNotification('music');
                    processedMatches.push(match);
                }
                return `<span style="display:none;">${match}</span>`;
            });

            // 5. IG Post
            text = text.replace(/\[IG\|post\|(web|local)\|(.*?)\|(.*?)\]/gi, (match, source, keyword, caption) => {
                if (!processedMatches.includes(match)) {
                    const sender = getContext().name2 || "Unknown";
                    if (source.trim().toLowerCase() === 'web') {
                        const cleanKeyword = keyword.replace(/\s+/g, ',');
                        const randomNum = Math.floor(Math.random() * 1000);
                        renderIGPostUI(sender, `https://loremflickr.com/400/400/${cleanKeyword}?random=${randomNum}`, caption.trim(), 'web', keyword.trim());
                    } else {
                        renderIGPostUI(sender, '', caption.trim(), 'local', keyword.trim());
                    }
                    hasNotification = true; triggerNotification('ig');
                    processedMatches.push(match);
                }
                return `<span style="display:none;">${match}</span>`;
            });

            // 5.5 IG Comment
            text = text.replace(/\[IG\|comment\|(?:(.*?)\|)?(.*?)\]/gi, (match, nameOpt, commentText) => {
                if (!processedMatches.includes(match)) {
                    const sender = nameOpt ? nameOpt.trim() : (getContext().name2 || "Unknown");
                    if (latestPostId) {
                        saveIGCommentToStorage(latestPostId, { name: sender, text: commentText.trim() });
                        addCommentToUI_NoSave(latestPostId, sender, commentText.trim());
                        hasNotification = true; triggerNotification('ig');
                    }
                    processedMatches.push(match);
                }
                return `<span style="display:none;">${match}</span>`;
            });

            // 6. Twitter Post
            text = text.replace(/\[Twitter\|post\|(.*?)\]/gi, (match, twText) => {
                if (!processedMatches.includes(match)) {
                    const sender = getContext().name2 || "Unknown";
                    renderTwitterPostUI(sender, twText.trim());
                    hasNotification = true; triggerNotification('twitter');
                    processedMatches.push(match);
                }
                return `<span style="display:none;">${match}</span>`;
            });

            // 6.5 Twitter Reply
            text = text.replace(/\[Twitter\|reply\|(.*?)\]/gi, (match, replyText) => {
                if (!processedMatches.includes(match)) {
                    const sender = getContext().name2 || "Unknown";
                    if (latestTweetId) {
                        saveTwitterReply(latestTweetId, { name: sender, text: replyText.trim() });
                        addTwitterReplyToUI_NoSave(latestTweetId, sender, replyText.trim());
                        hasNotification = true; triggerNotification('twitter');
                    }
                    processedMatches.push(match);
                }
                return `<span style="display:none;">${match}</span>`;
            });

            // อัปเดตข้อความบนหน้าจอ และเซฟสมุดจดบันทึก
            if (text !== originalText) {
                msgElement.innerHTML = text;
                msgElement.dataset.lastProcessedHtml = text;
            } else {
                msgElement.dataset.lastProcessedHtml = currentHtml;
            }

            // เก็บสมุดจดบันทึกคืนเข้าไปใน HTML
            msgElement.dataset.processedMatches = JSON.stringify(processedMatches);
        });
    }, 500);

    // โหลดข้อมูลเริ่มต้น
    loadLineHistoryForCurrentChar();
    updateLineChatList();
    loadIGHistoryForCurrentChar();

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

    // 5. ดักจับ Instagram (โพสต์ & คอมเมนต์)
    // แบบที่ 1: AI สร้างโพสต์ -> [IG|post|web/local|keyword|caption]
    const igPostRegex = /\[IG\|post\|(web|local)\|(.*?)\|(.*?)\]/gi;
    text = text.replace(igPostRegex, (match, source, keyword, caption) => {
        const sender = getContext().name2 || "Unknown";

        if (source.trim().toLowerCase() === 'web') {
            const cleanKeyword = keyword.replace(/\s+/g, ',');
            const randomNum = Math.floor(Math.random() * 1000);
            const imageUrl = `https://loremflickr.com/400/400/${cleanKeyword}?random=${randomNum}`;
            renderIGPostUI(sender, imageUrl, caption.trim());
        } else {
            // ดึงจาก Local DB
            if (imageDB) {
                const tx = imageDB.transaction([STORE_NAME], "readonly");
                const req = tx.objectStore(STORE_NAME).get(`ig_${keyword.trim().toLowerCase()}`);
                req.onsuccess = (e) => {
                    if (e.target.result && e.target.result.data) {
                        renderIGPostUI(sender, e.target.result.data, caption.trim());
                    } else {
                        renderIGPostUI(sender, 'https://via.placeholder.com/400?text=Local+Image+Not+Found', caption.trim());
                    }
                };
            }
        }
        hasNotification = true;
        triggerNotification('ig');
        return `<span style="display:none;" class="hidden-ig-msg">${match}</span>`;
    });

    // แบบที่ 2: AI คอมเมนต์ -> รองรับทั้ง [IG|comment|ข้อความ] และ [IG|comment|ชื่อ|ข้อความ]
    const igCommentRegex = /\[IG\|comment\|(?:(.*?)\|)?(.*?)\]/gi;
    text = text.replace(igCommentRegex, (match, nameOpt, commentText) => {
        // ถ้ามีการระบุชื่อมา ให้ใช้ชื่อนั้น ถ้าไม่มีให้ใช้ชื่อบอทปัจจุบัน
        const sender = nameOpt ? nameOpt.trim() : (getContext().name2 || "Unknown");

        if (latestPostId) {
            saveIGCommentToStorage(latestPostId, { name: sender, text: commentText.trim() });
            addCommentToUI_NoSave(latestPostId, sender, commentText.trim());
            hasNotification = true;
            triggerNotification('ig');
        }
        return `<span style="display:none;" class="hidden-ig-msg">${match}</span>`;
    });

        // 6. ดักจับ Twitter (โพสต์ & รีพลาย)
    // แบบที่ 1: AI สร้างทวีตใหม่ -> [Twitter|post|ข้อความ]
    const twPostRegex = /\[Twitter\|post\|(.*?)\]/gi;
    text = text.replace(twPostRegex, (match, twText) => {
        const sender = getContext().name2 || "Unknown";
        renderTwitterPostUI(sender, twText.trim());
        hasNotification = true;
        triggerNotification('twitter');
        return `<span style="display:none;" class="hidden-tw-msg">${match}</span>`;
    });

    // แบบที่ 2: AI รีพลายทวีต -> [Twitter|reply|ข้อความ]
    const twReplyRegex = /\[Twitter\|reply\|(.*?)\]/gi;
    text = text.replace(twReplyRegex, (match, replyText) => {
        const sender = getContext().name2 || "Unknown";
        if (latestTweetId) {
            saveTwitterReply(latestTweetId, { name: sender, text: replyText.trim() });
            addTwitterReplyToUI_NoSave(latestTweetId, sender, replyText.trim());
            hasNotification = true;
            triggerNotification('twitter');
        }
        return `<span style="display:none;" class="hidden-tw-msg">${match}</span>`;
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

// --- ฟังก์ชันเปิด/ปิด โทรศัพท์ (แบบชัวร์ 100%) ---
window.togglePhone = function() {
    console.log("📱 กำลังพยายามเปิด/ปิดโทรศัพท์... สถานะปัจจุบัน:", isPhoneOpen);

    const phone = document.getElementById('st-phone-container');
    const badge = document.getElementById('st-phone-badge');
    const fab = document.getElementById('st-phone-fab');

    if (!phone) {
        console.error("❌ หาหน้าจอโทรศัพท์ไม่เจอ! (ID: st-phone-container)");
        return;
    }

    isPhoneOpen = !isPhoneOpen;

    if (isPhoneOpen) {
        phone.style.display = 'flex';
        if (badge) badge.style.display = 'none';
        if (fab) fab.classList.remove('fab-vibrating');
        console.log("✅ โทรศัพท์เปิดแล้ว!");
    } else {
        phone.style.display = 'none';
        console.log("❌ โทรศัพท์ปิดแล้ว!");
    }
};


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
        document.getElementById('btn-toggle-phone')?.addEventListener('click', togglePhone);
        document.getElementById('btn-toggle-fab')?.addEventListener('click', toggleFabVisibility);

        // ปุ่มทดสอบการแจ้งเตือน
        document.getElementById('btn-test-notification')?.addEventListener('click', () => {
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
// --- ฟังก์ชันทำให้ปุ่มลากได้ (แก้บั๊กคลิกเบิ้ลบนมือถือ) ---
function makeDraggable(element) {
    let currentX = 0, currentY = 0, initialX, initialY, xOffset = 0, yOffset = 0;
    let active = false;
    let isDragging = false;

    // รองรับทั้ง Touch และ Mouse
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

        if (e.target === element || element.contains(e.target)) {
            active = true;
            isDragging = false; // เริ่มต้นถือว่ายังไม่ได้ลาก
        }
    }

    function dragEnd(e) {
        if (!active) return;
        initialX = currentX;
        initialY = currentY;
        active = false;

        // หน่วงเวลาเพื่อไม่ให้ click event ทำงานถ้าเพิ่งลากเสร็จ
        setTimeout(() => { isDragging = false; }, 100);
    }

    function drag(e) {
        if (active) {
            e.preventDefault(); // ป้องกันหน้าจอเลื่อน
            isDragging = true;  // ถือว่ากำลังลากอยู่

            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            xOffset = currentX;
            yOffset = currentY;
            element.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    }

    // --- ใช้ Event Click มาตรฐานแทน เพื่อป้องกันบั๊ก Ghost Click ---
    element.addEventListener('click', (e) => {
        // ถ้ากำลังลากอยู่ จะไม่เปิดโทรศัพท์
        if (isDragging) {
            e.preventDefault();
            return;
        }
        // ถ้าไม่ได้ลาก (แค่แตะ) ให้เปิดโทรศัพท์เลย
        togglePhone();
    });

    window.addEventListener('resize', () => {
        xOffset = 0; yOffset = 0;
        element.style.transform = `translate3d(0px, 0px, 0)`;
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

// เมื่อมีสายเข้า (AI โทรมา)
window.triggerIncomingCall = function(callerName) {
    currentCallerName = callerName;
    const avatarUrl = getAvatarUrl(false, callerName);

    // อัปเดต UI หน้าสายเรียกเข้า
    document.getElementById('incoming-name').innerText = callerName;
    document.getElementById('incoming-avatar').style.backgroundImage = `url('${avatarUrl}')`;

    // สลับหน้าจอ: โชว์หน้าสายเรียกเข้า และ **ซ่อนหน้าประวัติการโทร**
    document.getElementById('phone-incoming-view').style.display = 'flex';
    document.getElementById('phone-active-view').style.display = 'none';
    document.getElementById('phone-history-view').style.display = 'none'; // <--- เพิ่มบรรทัดนี้ (ซ่อนหน้าประวัติ)

    // เปิดแอปโทรศัพท์ขึ้นมาอัตโนมัติ
    if (!isPhoneOpen) togglePhone();
    openApp('phone', 'Phone');
};

window.initiateCallOut = function() {
    const context = getContext();
    const charName = context.name2 || "Character";
    currentCallerName = charName;
    const avatarUrl = getAvatarUrl(false, charName);

    // เซ็ตภาพพื้นหลังเต็มจอ และรูปกลม
    const activeView = document.getElementById('phone-active-view');
    activeView.style.backgroundImage = `url('${avatarUrl}')`;
    document.getElementById('active-avatar').style.backgroundImage = `url('${avatarUrl}')`;
    document.getElementById('active-name').innerText = charName;
    document.getElementById('phone-transcript').innerHTML = '<div style="text-align: center; color: #ccc; font-size: 12px; margin-top: 10px;">Ringing...</div>';
    document.getElementById('active-timer').innerText = "Calling...";

    // สลับหน้าจอ
    document.getElementById('phone-history-view').style.display = 'none';
    activeView.style.display = 'flex';

    // ส่ง Prompt โทรออกหาบอท
    sendHiddenPrompt(`[System: ผู้ใช้กดโทรศัพท์หา ${charName} (กำลังรอสาย...)]`);
    isCallActive = true; // เปิดสถานะสาย
};

// กดรับสาย
window.acceptCall = function() {
    isCallActive = true;
    const avatarUrl = getAvatarUrl(false, currentCallerName);

    const activeView = document.getElementById('phone-active-view');
    activeView.style.backgroundImage = `url('${avatarUrl}')`;
    document.getElementById('active-name').innerText = currentCallerName;
    document.getElementById('active-avatar').style.backgroundImage = `url('${avatarUrl}')`;
    document.getElementById('phone-transcript').innerHTML = '<div style="text-align: center; color: #ccc; font-size: 12px; margin-top: 10px;">Call connected.</div>';

    // สลับหน้าจอ: โชว์หน้าคุยสาย และ **ซ่อนหน้าอื่นๆ**
    document.getElementById('phone-incoming-view').style.display = 'none';
    document.getElementById('phone-history-view').style.display = 'none'; // <--- เพิ่มบรรทัดนี้เพื่อความชัวร์
    activeView.style.display = 'flex';

    callSeconds = 0;
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        document.getElementById('active-timer').innerText = `${mins}:${secs}`;
    }, 1000);

    sendHiddenPrompt(`[System: ผู้ใช้กดรับสายโทรศัพท์จาก ${currentCallerName} แล้ว]`);
};

window.endCall = function() {
    isCallActive = false;
    clearInterval(callTimerInterval);
    document.getElementById('phone-active-view').style.display = 'none';
    document.getElementById('phone-history-view').style.display = 'flex'; // กลับมาหน้าประวัติ
    sendHiddenPrompt(`[System: ผู้ใช้วางสายโทรศัพท์แล้ว]`);
};

// กดตัดสาย
window.declineCall = function() {
    // ปิดแอปโทรศัพท์
    document.getElementById('window-phone').style.display = 'none';

    // รีเซ็ตหน้าจอให้กลับไปหน้าประวัติการโทร (เผื่อเปิดแอปมาใหม่คราวหน้า)
    document.getElementById('phone-incoming-view').style.display = 'none';
    document.getElementById('phone-active-view').style.display = 'none';
    document.getElementById('phone-history-view').style.display = 'flex'; // <--- คืนค่าหน้าประวัติ

    // ส่ง Prompt บอก AI ว่าเราตัดสาย
    sendHiddenPrompt(`[System: ผู้ใช้กดตัดสายโทรศัพท์จาก ${currentCallerName}]`);
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

// ==========================================
// --- ระบบแอป Instagram (ฉบับสมบูรณ์) ---
// ==========================================

let tempIGBase64 = "";
let latestPostId = ""; // เก็บ ID โพสต์ล่าสุดเพื่อให้ AI คอมเมนต์ถูกที่

// 1. เปิด/ปิด หน้าต่างสร้างโพสต์
window.openIGCreatePost = function() {
    document.getElementById('ig-create-post-modal').style.display = 'flex';
};

window.closeIGCreatePost = function() {
    document.getElementById('ig-create-post-modal').style.display = 'none';
    document.getElementById('ig-upload-input').value = "";
    document.getElementById('ig-upload-preview').style.backgroundImage = "none";
    document.getElementById('ig-upload-preview').innerHTML = '<div style="color: #888;">Tap to select image</div>';
    document.getElementById('ig-caption-input').value = "";
    document.getElementById('ig-hidden-desc-input').value = "";
    tempIGBase64 = "";
};

// 2. พรีวิวรูปตอนเลือกไฟล์
window.previewIGUpload = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        tempIGBase64 = e.target.result;
        const preview = document.getElementById('ig-upload-preview');
        preview.style.backgroundImage = `url('${tempIGBase64}')`;
        preview.innerHTML = ""; // ลบข้อความ Tap to select
    };
    reader.readAsDataURL(file);
};

// ผู้ใช้กด Share โพสต์ของตัวเอง (แก้บั๊กความจำเต็ม)
window.submitIGPost = function() {
    const caption = document.getElementById('ig-caption-input').value.trim();
    const hiddenDesc = document.getElementById('ig-hidden-desc-input').value.trim();

    if (!tempIGBase64) return alert("กรุณาเลือกรูปภาพก่อนครับ");

    const context = getContext();
    const myName = context.name1 || "Me";

    // สร้างชื่อ ID เฉพาะให้รูปนี้
    const uniqueKeyword = 'userpost_' + Date.now();

    // เอาไฟล์รูปไปฝากไว้ใน IndexedDB แทนที่จะเซฟลง LocalStorage ตรงๆ
    if (imageDB) {
        const transaction = imageDB.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.put({
            id: `ig_${uniqueKeyword}`,
            type: 'ig',
            keyword: uniqueKeyword,
            data: tempIGBase64
        }).onsuccess = function() {
            // สั่งสร้างโพสต์โดยให้ระบบไปดึงรูปจาก Local แทน
            renderIGPostUI(myName, '', caption, 'local', uniqueKeyword);

            // ส่ง Prompt เบื้องหลังบอก AI
            const promptText = `[IG Post โดย ${myName}: (ภาพ: ${hiddenDesc}) แคปชั่น: "${caption}"] <span style="display:none;">(OOC: คุณสามารถคอมเมนต์โพสต์นี้ได้โดยพิมพ์ [IG|comment|ข้อความคอมเมนต์])</span>`;
            sendHiddenPrompt(promptText);

            closeIGCreatePost();
        };
    } else {
        alert("Database not ready!");
    }
};

// ฟังก์ชันหลักสำหรับสร้าง UI โพสต์ (เมื่อมีการโพสต์ใหม่)
window.renderIGPostUI = function(senderName, imageSource, caption, sourceType = 'base64', keyword = '') {
    const postId = 'post_' + Date.now();
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // สร้าง Object ข้อมูลโพสต์เพื่อนำไปเซฟ
    const postData = {
        postId: postId,
        senderName: senderName,
        imageSource: imageSource,
        caption: caption,
        sourceType: sourceType,
        keyword: keyword,
        timeString: timeString,
        comments: []
    };

    // 1. เซฟลง Storage
    saveIGPostToStorage(postData);

    // 2. แสดงผลบนหน้าจอ
    renderIGPostUI_FromHistory(postData);
    latestPostId = postId;
};

// ฟังก์ชันสร้าง UI โพสต์จากข้อมูล (ใช้ทั้งตอนโพสต์ใหม่และตอนโหลดประวัติ)
window.renderIGPostUI_FromHistory = function(postData) {
    const contentIG = document.getElementById('content-ig');
    const emptyState = document.getElementById('ig-empty-state');
    if (emptyState) emptyState.style.display = 'none';

    latestPostId = postData.postId;
    const avatarUrl = getAvatarUrl(postData.senderName === (getContext().name1 || "Me"), postData.senderName);

    const postDiv = document.createElement('div');
    postDiv.className = 'ig-post';
    postDiv.id = postData.postId;

    postDiv.innerHTML = `
        <div class="ig-post-header">
            <div class="ig-avatar" style="background-image: url('${avatarUrl}');"></div>
            <div class="ig-username">${postData.senderName}</div>
        </div>
        <div class="ig-image-container" id="img-container-${postData.postId}">
            <div style="color: #888; font-size: 12px;">Loading image...</div>
        </div>
        <div class="ig-actions">
            <div class="ig-action-icon" onclick="this.classList.toggle('liked'); this.innerText = this.classList.contains('liked') ? '❤️' : '🤍'">🤍</div>
            <div class="ig-action-icon">💬</div>
        </div>
        <div class="ig-caption-area">
            <span class="ig-username">${postData.senderName}</span> ${postData.caption}
            <div class="ig-time">${postData.timeString}</div>
        </div>
        <div class="ig-comments-area" id="comments-${postData.postId}"></div>
        <div class="ig-add-comment-box">
            <input type="text" class="ig-comment-input" id="input-${postData.postId}" placeholder="Add a comment...">
            <button class="ig-comment-btn" onclick="sendIGComment('${postData.postId}', '${postData.senderName}')">Post</button>
        </div>
    `;

    // แทรกโพสต์ต่อท้าย (เพราะตอนโหลดประวัติมันเรียงจากใหม่ไปเก่าอยู่แล้ว)
    contentIG.appendChild(postDiv);

    // จัดการรูปภาพ
    const imgContainer = document.getElementById(`img-container-${postData.postId}`);
    if (postData.sourceType === 'base64') {
        imgContainer.innerHTML = `<img src="${postData.imageSource}" class="ig-image" onerror="this.src='https://via.placeholder.com/400?text=Image+Error'">`;
    }
    else if (postData.sourceType === 'web') {
        const cleanKeyword = postData.keyword.replace(/\s+/g, ',');
        // ใช้ postId เป็น seed แทน random เพื่อให้โหลดกี่ครั้งก็ได้รูปเดิม
        const imageUrl = `https://loremflickr.com/400/400/${cleanKeyword}?lock=${postData.postId.replace('post_', '')}`;
        imgContainer.innerHTML = `<img src="${imageUrl}" class="ig-image" onerror="this.src='https://via.placeholder.com/400?text=Image+Not+Found'">`;
    }
    else if (postData.sourceType === 'local') {
        if (imageDB) {
            const cleanKeyword = postData.keyword.trim().toLowerCase();
            const transaction = imageDB.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`ig_${cleanKeyword}`);
            request.onsuccess = function(event) {
                const result = event.target.result;
                if (result && result.data) {
                    imgContainer.innerHTML = `<img src="${result.data}" class="ig-image">`;
                } else {
                    imgContainer.innerHTML = `<div style="color: red; padding: 20px;">[Local Image Not Found: ${postData.keyword}]</div>`;
                }
            };
        }
    }

    // โหลดคอมเมนต์เก่า (ถ้ามี)
    if (postData.comments && postData.comments.length > 0) {
        postData.comments.forEach(c => {
            addCommentToUI_NoSave(postData.postId, c.name, c.text);
        });
    }
};

// ผู้ใช้พิมพ์คอมเมนต์ (เซฟ + แสดงผล + ส่ง AI)
window.sendIGComment = function(postId, postOwner) {
    const input = document.getElementById(`input-${postId}`);
    const text = input.value.trim();
    if (!text) return;

    const myName = getContext().name1 || "Me";

    // 1. เซฟคอมเมนต์ลง Storage
    saveIGCommentToStorage(postId, { name: myName, text: text });

    // 2. โชว์คอมเมนต์บนหน้าจอ
    addCommentToUI_NoSave(postId, myName, text);

    // 3. ส่ง Prompt เบื้องหลัง
    sendHiddenPrompt(`[IG Comment จาก ${myName} ไปที่โพสต์ของ ${postOwner}: "${text}"]`);

    input.value = "";
};

// เพิ่มคอมเมนต์ลงใน UI (ใช้ตอนโหลดประวัติและตอนพิมพ์ใหม่)
window.addCommentToUI_NoSave = function(postId, name, text) {
    const commentsArea = document.getElementById(`comments-${postId}`);
    if (!commentsArea) return;

    const commentDiv = document.createElement('div');
    commentDiv.className = 'ig-comment-line';
    commentDiv.innerHTML = `<span class="ig-username">${name}</span> ${text}`;
    commentsArea.appendChild(commentDiv);
};

// ฟังก์ชันสำหรับ AI คอมเมนต์ (รับจาก Regex)
window.addCommentToUI = function(postId, name, text) {
    saveIGCommentToStorage(postId, { name: name, text: text });
    addCommentToUI_NoSave(postId, name, text);
};

// ==========================================
// --- ระบบแอป Twitter ---
// ==========================================
const TW_STORAGE_KEY = 'st_virtualphone_tw_history';
let latestTweetId = "";

// --- ระบบ Storage ---
function getAllTwitterHistory() {
    const data = localStorage.getItem(TW_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

function loadTwitterHistoryForCurrentChar() {
    const context = getContext();
    const charId = context.characterId;
    if (!charId) return;

    const allHistory = getAllTwitterHistory();
    const charTweets = allHistory[charId] || [];

    const contentTW = document.getElementById('content-twitter');
    if (!contentTW) return;

    // ล้างหน้าจอ ยกเว้นปุ่มสร้างทวีต
    const fabBtn = contentTW.querySelector('.tw-fab-create');
    contentTW.innerHTML = '';
    if (fabBtn) contentTW.appendChild(fabBtn);

    if (charTweets.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.id = 'tw-empty-state';
        emptyState.style.cssText = "text-align: center; padding: 20px; color: #71767b;";
        emptyState.innerText = "No tweets yet.";
        contentTW.appendChild(emptyState);
        return;
    }

    charTweets.forEach(tweet => renderTwitterUI_FromHistory(tweet));
}

function saveTwitterPost(tweetData) {
    const charId = getContext().characterId;
    if (!charId) return;
    const allHistory = getAllTwitterHistory();
    if (!allHistory[charId]) allHistory[charId] = [];
    allHistory[charId].unshift(tweetData);
    localStorage.setItem(TW_STORAGE_KEY, JSON.stringify(allHistory));
}

function saveTwitterReply(tweetId, replyData) {
    const charId = getContext().characterId;
    if (!charId) return;
    const allHistory = getAllTwitterHistory();
    if (!allHistory[charId]) return;
    const index = allHistory[charId].findIndex(t => t.tweetId === tweetId);
    if (index !== -1) {
        if (!allHistory[charId][index].replies) allHistory[charId][index].replies = [];
        allHistory[charId][index].replies.push(replyData);
        localStorage.setItem(TW_STORAGE_KEY, JSON.stringify(allHistory));
    }
}

// --- ระบบ UI ผู้ใช้สร้างทวีต ---
window.openTwitterCreate = function() { document.getElementById('tw-create-modal').style.display = 'flex'; };
window.closeTwitterCreate = function() { document.getElementById('tw-create-modal').style.display = 'none'; document.getElementById('tw-input').value = ""; };

window.submitTwitterPost = function() {
    const text = document.getElementById('tw-input').value.trim();
    if (!text) return;

    const myName = getContext().name1 || "Me";

    // โชว์หน้าจอ & เซฟ
    renderTwitterPostUI(myName, text);

    // ส่ง Prompt หา AI
    sendHiddenPrompt(`[Twitter Post โดย ${myName}: "${text}"] <span style="display:none;">(OOC: คุณสามารถตอบกลับทวีตนี้ได้โดยพิมพ์ [Twitter|reply|ข้อความ])</span>`);
    closeTwitterCreate();
};

// --- ฟังก์ชันหลักสร้าง UI ทวีต ---
window.renderTwitterPostUI = function(senderName, text) {
    const tweetId = 'tw_' + Date.now();
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const tweetData = { tweetId, senderName, text, timeString, replies: [] };
    saveTwitterPost(tweetData);
    renderTwitterUI_FromHistory(tweetData);
    latestTweetId = tweetId;
};

window.renderTwitterUI_FromHistory = function(tweetData) {
    const contentTW = document.getElementById('content-twitter');
    const emptyState = document.getElementById('tw-empty-state');
    if (emptyState) emptyState.style.display = 'none';

    latestTweetId = tweetData.tweetId;
    const avatarUrl = getAvatarUrl(tweetData.senderName === (getContext().name1 || "Me"), tweetData.senderName);
    const username = "@" + tweetData.senderName.replace(/\s+/g, '').toLowerCase();

    const twDiv = document.createElement('div');
    twDiv.className = 'tw-post';
    twDiv.id = tweetData.tweetId;

    twDiv.innerHTML = `
        <div class="tw-post-header">
            <div class="tw-avatar" style="background-image: url('${avatarUrl}');"></div>
            <div class="tw-name-group">
                <div class="tw-display-name">${tweetData.senderName}</div>
                <div class="tw-username">${username} • ${tweetData.timeString}</div>
            </div>
        </div>
        <div class="tw-text">${tweetData.text}</div>
        <div class="tw-actions">
            <div class="tw-action-icon">💬 Reply</div>
            <div class="tw-action-icon">🔄 RT</div>
            <div class="tw-action-icon" onclick="this.classList.toggle('liked');">🤍 Like</div>
        </div>
        <div class="tw-replies-area" id="tw-replies-${tweetData.tweetId}"></div>
        <div class="tw-add-reply-box">
            <input type="text" class="tw-reply-input" id="tw-input-${tweetData.tweetId}" placeholder="Post your reply...">
            <button class="tw-reply-btn" onclick="sendTwitterReply('${tweetData.tweetId}', '${tweetData.senderName}')">Reply</button>
        </div>
    `;

    // แทรกทวีตไว้บนสุดของฟีด
    contentTW.insertBefore(twDiv, contentTW.firstChild);

    if (tweetData.replies) {
        tweetData.replies.forEach(r => addTwitterReplyToUI_NoSave(tweetData.tweetId, r.name, r.text));
    }
};

// --- ระบบ Reply ---
window.sendTwitterReply = function(tweetId, postOwner) {
    const input = document.getElementById(`tw-input-${tweetId}`);
    const text = input.value.trim();
    if (!text) return;

    const myName = getContext().name1 || "Me";
    saveTwitterReply(tweetId, { name: myName, text: text });
    addTwitterReplyToUI_NoSave(tweetId, myName, text);

    sendHiddenPrompt(`[Twitter Reply จาก ${myName} ไปที่ทวีตของ ${postOwner}: "${text}"]`);
    input.value = "";
};

window.addTwitterReplyToUI_NoSave = function(tweetId, name, text) {
    const repliesArea = document.getElementById(`tw-replies-${tweetId}`);
    if (!repliesArea) return;
    const username = "@" + name.replace(/\s+/g, '').toLowerCase();

    const replyDiv = document.createElement('div');
    replyDiv.className = 'tw-reply-line';
    replyDiv.innerHTML = `<span style="font-weight:bold; color:white;">${name}</span> <span style="color:#71767b;">${username}</span><br>${text}`;
    repliesArea.appendChild(replyDiv);
};

// --- 2.4 แทรกคำสั่งโหลด History ตอนเริ่ม ---
eventSource.on(event_types.CHAT_CHANGED, () => {
    loadTwitterHistoryForCurrentChar();
});
setTimeout(() => loadTwitterHistoryForCurrentChar(), 1000);

// เรียกใช้ฟังก์ชันนี้ตอนโหลด Extension เพื่อตั้งค่าสีและวอลเปเปอร์เริ่มต้น
jQuery(async () => {
    console.log("📱 ST Virtual Phone Loaded!");
    createPhoneUI();
    setupSettingsMenu();
    setupMessageHook();
    loadPhoneSettings();
    initImageDB();
    setTimeout(() => {
        updateLineChatList();
        loadIGHistoryForCurrentChar();
    }, 1000);
});
