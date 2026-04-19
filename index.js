import { getContext } from "../../../extensions.js";
// นำเข้า eventSource จากระบบหลักของ SillyTavern เพื่อดักจับข้อความ
import { eventSource, event_types } from "../../../../script.js";

// --- ระบบจัดการประวัติแชท (Local Storage) ---
const STORAGE_KEY = 'st_virtualphone_line_history';

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
    { id: 'settings', name: 'Settings', icon: '⚙️', color: '#8E8E93' }
];

function createPhoneUI() {
    // 1. สร้าง Floating Button
    const fab = document.createElement('div');
    fab.id = 'st-phone-fab';
    fab.innerHTML = `📱<div id="st-phone-badge"></div>`;
    document.body.appendChild(fab);

    // เรียกใช้ฟังก์ชันทำให้ปุ่มลากได้
    makeDraggable(fab);
    
    // 2. สร้างกรอบโทรศัพท์
    const phoneContainer = document.createElement('div');
    phoneContainer.id = 'st-phone-container';

    // สร้างหน้าจอหลัก (Screen)
    const screen = document.createElement('div');
    screen.id = 'st-phone-screen';

    // สร้าง Home Screen
    const homeScreen = document.createElement('div');
    homeScreen.id = 'st-phone-home';

    // สร้างไอคอนแอปใส่ใน Home Screen
    apps.forEach(app => {
        const appIcon = document.createElement('div');
        appIcon.className = 'st-app-icon';
        appIcon.innerHTML = `
            <div class="st-app-icon-img" style="color: ${app.color};">${app.icon}</div>
            <div class="st-app-badge" id="badge-${app.id}">1</div>
            <div class="st-app-icon-name">${app.name}</div>
        `;
        appIcon.addEventListener('click', () => openApp(app.id, app.name));
        homeScreen.appendChild(appIcon);
    });

    screen.appendChild(homeScreen);

    // สร้างหน้าต่างสำหรับแต่ละแอป (ซ่อนไว้ก่อน)
    apps.forEach(app => {
        const appWindow = document.createElement('div');
        appWindow.id = `window-${app.id}`;
        appWindow.className = 'st-app-window';

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

        // เมื่อกดปุ่ม Send
        lineSendBtn.addEventListener('click', () => {
            const text = lineInput.value.trim();
            if (text) {
                const context = getContext();
                const myName = context.name1 || "Me"; // ชื่อผู้เล่น
                const charName = context.name2 || "Character"; // ชื่อบอท

                // 1. นำข้อความไปโชว์ในแชท Line ฝั่งเรา (สีเขียว)
                addMessageToLineUI(myName, text, true);

                // 2. ส่งข้อความเบื้องหลังไปให้ AI ในหน้าต่างแชทหลักของ ST
                // เราจะใส่ฟอร์แมต [Line: ข้อความ] เพื่อให้ AI รู้ว่าเราตอบผ่านแอป
                const hiddenPrompt = `[Line ไปหา ${currentActiveLineChat}: ${text}]`;

                // นำข้อความไปใส่ในกล่องพิมพ์ของ ST และกดส่งอัตโนมัติ
                const stTextarea = document.getElementById('send_textarea');
                const stSendBtn = document.getElementById('send_but');

                if (stTextarea && stSendBtn) {
                    stTextarea.value = hiddenPrompt;
                    stTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    stSendBtn.click();
                }

                // รีเซ็ตช่องพิมพ์
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

    // 2. ดักจับแอป Phone (รูปแบบ: [Call|ชื่อคนโทร])
    const callRegex = /\[Call\|(.*?)\]/gi;
    text = text.replace(callRegex, (match, caller) => {
        hasNotification = true;
        triggerNotification('phone');
        return `<span style="display:none;">${match}</span>`;
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

jQuery(async () => {
    console.log("📱 ST Virtual Phone Phase 2 Loaded!");
    createPhoneUI();
    setupMessageHook();
});