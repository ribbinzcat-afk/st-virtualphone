import { getContext } from "../../../extensions.js";
// นำเข้า eventSource จากระบบหลักของ SillyTavern เพื่อดักจับข้อความ
import { eventSource, event_types } from "../../../../script.js";

let isPhoneOpen = false;
let isFabVisible = true;
// ตัวแปรสำหรับเช็คว่ากำลังลากปุ่มอยู่หรือไม่ (ป้องกันการคลิกเปิดโทรศัพท์ตอนลาก)
let isDragging = false;

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
            // --- โครงสร้างแอป LINE ---
            appWindow.innerHTML = `
                <div class="st-app-header">
                    <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮</div>
                    <div id="line-chat-title">Rex (เร็กซ์)</div>
                    <div class="line-header-icons">📞 ≡</div>
                </div>
                <div class="st-app-content" id="content-${app.id}">
                    <!-- ตัวอย่างข้อความฝั่งคนอื่น -->
                    <div class="line-msg-wrapper other-message">
                        <div class="line-avatar" style="background-image: url('https://i.pravatar.cc/100?img=11');"></div>
                        <div class="line-msg-content">
                            <div class="line-sender-name">Rex</div>
                            <div style="display: flex;">
                                <div class="line-bubble">ตื่นหรือยัง? วันนี้มีภารกิจนะ</div>
                                <div class="line-time">08:30</div>
                            </div>
                        </div>
                    </div>

                    <!-- ตัวอย่างข้อความฝั่งเรา -->
                    <div class="line-msg-wrapper my-message">
                        <div class="line-msg-content">
                            <div style="display: flex; flex-direction: row-reverse;">
                                <div class="line-bubble">ตื่นแล้วๆ กำลังเตรียมตัวอยู่!</div>
                                <div class="line-time">08:32</div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- แถบพิมพ์ข้อความ -->
                <div class="line-input-area">
                    <div class="line-icon-btn">＋</div>
                    <div class="line-icon-btn">📷</div>
                    <div class="line-icon-btn">😊</div>
                    <input type="text" class="line-input-field" id="line-input" placeholder="Aa">
                    <div class="line-icon-btn" id="line-mic-icon">🎤</div>
                    <div class="line-send-btn" id="line-send-btn">Send</div>
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
                const hiddenPrompt = `[Line ไปหา ${charName}: ${text}]`;

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
    const contentLine = document.getElementById('content-line');
    if (!contentLine) return;

    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const avatarUrl = getAvatarUrl(isMe, senderName);

    const msgDiv = document.createElement('div');
    msgDiv.className = `line-msg-wrapper ${isMe ? 'my-message' : 'other-message'}`;

    if (isMe) {
        // โครงสร้างฝั่งเรา (ไม่มีรูป Avatar)
        msgDiv.innerHTML = `
            <div class="line-msg-content">
                <div style="display: flex; flex-direction: row-reverse;">
                    <div class="line-bubble">${message}</div>
                    <div class="line-time">${timeString}</div>
                </div>
            </div>
        `;
    } else {
        // โครงสร้างฝั่งคนอื่น (มีรูป Avatar และชื่อ)
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

    // เลื่อนหน้าจอแชทลงมาล่างสุดอัตโนมัติ
    contentLine.scrollTop = contentLine.scrollHeight;
}

// --- ระบบ Regex Hook ดักจับข้อความจาก AI (อัปเดตใหม่) ---
function setupMessageHook() {
    eventSource.on(event_types.MESSAGE_RECEIVED, handleNewMessage);
    eventSource.on(event_types.MESSAGE_UPDATED, handleNewMessage);

    // อัปเดตชื่อแชท Line ด้านบนเมื่อเปลี่ยนตัวละคร
    eventSource.on(event_types.CHAT_CHANGED, () => {
        const titleElement = document.getElementById('line-chat-title');
        if (titleElement) {
            titleElement.innerText = getContext().name2 || "Chat";
        }
        // ล้างประวัติแชทบนหน้าจอเมื่อเปลี่ยนห้อง (เดี๋ยวทำระบบเซฟประวัติใน Phase ถัดไป)
        const contentLine = document.getElementById('content-line');
        if (contentLine) contentLine.innerHTML = '';
    });
}

function handleNewMessage(messageId) {
    const msgElement = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`);
    if (!msgElement) return;

    let text = msgElement.innerHTML;
    let hasNotification = false;

    // 1. ดักจับแอป Line (รูปแบบ: [Line|ชื่อคนส่ง|ข้อความ] หรือ [Line: ข้อความ])
    // รองรับทั้งแบบระบุชื่อ และไม่ระบุชื่อ (ใช้ชื่อบอทปัจจุบันแทน)
    const lineRegex = /\[Line(?:\|(.*?))?\|?(.*?)\]/gi;

    text = text.replace(lineRegex, (match, sender, message) => {
        const context = getContext();
        const actualSender = sender ? sender.trim() : (context.name2 || "Unknown");
        const actualMessage = message ? message.trim() : "";

        // เอาข้อความไปใส่ในแอป Line
        addMessageToLineUI(actualSender, actualMessage, false);

        hasNotification = true;
        triggerNotification('line');

        // ซ่อนข้อความนี้จากหน้าต่างแชทหลัก
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

// --- ระบบ Regex Hook ดักจับข้อความจาก AI ---
function setupMessageHook() {
    // ดักจับเมื่อมีข้อความใหม่ถูกส่งเข้ามาหรือถูกแก้ไข
    eventSource.on(event_types.MESSAGE_RECEIVED, handleNewMessage);
    eventSource.on(event_types.MESSAGE_UPDATED, handleNewMessage);
}

function handleNewMessage(messageId) {
    // ดึง Context ของแชทปัจจุบัน
    const context = getContext();
    const chat = context.chat;

    // หาข้อความล่าสุดจาก messageId
    const msgElement = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`);
    if (!msgElement) return;

    let text = msgElement.innerHTML;
    let hasNotification = false;

    // 1. ดักจับแอป Line (รูปแบบ: [Line|ชื่อคนส่ง|ข้อความ])
    const lineRegex = /\[Line\|(.*?)\|(.*?)\]/gi;
    text = text.replace(lineRegex, (match, sender, message) => {
        console.log(`📱 ได้รับข้อความ Line จาก ${sender}: ${message}`);

        // TODO: ใน Phase หน้า เราจะเอาข้อมูลนี้ไปยัดใส่ UI ของแอป Line

        hasNotification = true;
        triggerNotification('line');

        // Return ค่าว่าง เพื่อ "ซ่อน" ข้อความนี้จากหน้าแชทหลัก
        return `<span style="display:none;">${match}</span>`;
    });

    // 2. ดักจับแอป Phone (รูปแบบ: [Call|ชื่อคนโทร])
    const callRegex = /\[Call\|(.*?)\]/gi;
    text = text.replace(callRegex, (match, caller) => {
        console.log(`📞 มีสายเข้าจาก: ${caller}`);
        hasNotification = true;
        triggerNotification('phone');
        return `<span style="display:none;">${match}</span>`;
    });

    // ถ้ามีการแก้ไขข้อความ ให้เขียนทับกลับไปที่หน้าจอแชท
    if (hasNotification) {
        msgElement.innerHTML = text;
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

jQuery(async () => {
    console.log("📱 ST Virtual Phone Phase 2 Loaded!");
    createPhoneUI();
    setupMessageHook();
});