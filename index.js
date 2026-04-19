import { extension_settings, getContext } from "../../../extensions.js";

// ตัวแปรเก็บสถานะ
let isPhoneOpen = false;
let isFabVisible = true;

// 1. สร้าง HTML Elements (Floating Button & Phone Container)
function createPhoneUI() {
    // สร้างปุ่ม Floating
    const fab = document.createElement('div');
    fab.id = 'st-phone-fab';
    fab.innerHTML = `📱<div id="st-phone-badge"></div>`;
    document.body.appendChild(fab);

    // สร้างกรอบโทรศัพท์
    const phoneContainer = document.createElement('div');
    phoneContainer.id = 'st-phone-container';
    phoneContainer.innerHTML = `<div id="st-phone-screen">
        <h3 style="text-align: center; margin-top: 50%; color: black;">Home Screen<br>(รอใส่ไอคอนแอป)</h3>
    </div>`;
    document.body.appendChild(phoneContainer);

    // Event เปิด/ปิดโทรศัพท์เมื่อกดปุ่ม Floating
    fab.addEventListener('click', togglePhone);
}

// 2. ฟังก์ชันเปิด/ปิด โทรศัพท์
function togglePhone() {
    const phone = document.getElementById('st-phone-container');
    const badge = document.getElementById('st-phone-badge');
    const fab = document.getElementById('st-phone-fab');

    isPhoneOpen = !isPhoneOpen;

    if (isPhoneOpen) {
        phone.style.display = 'flex';
        // เมื่อเปิดโทรศัพท์ ให้หยุดสั่นและซ่อนจุดแดง
        badge.style.display = 'none';
        fab.classList.remove('fab-vibrating');
    } else {
        phone.style.display = 'none';
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
            <button id="btn-test-notification" class="st-phone-settings-btn" style="background-color: #f59e0b;">Test Notification (สั่น)</button>
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
}

// 5. ฟังก์ชันจำลองการแจ้งเตือน (จุดแดง + สั่น)
function triggerNotification() {
    const fab = document.getElementById('st-phone-fab');
    const badge = document.getElementById('st-phone-badge');

    if (!isPhoneOpen) {
        fab.classList.add('fab-vibrating');
        badge.style.display = 'block';

        // ให้สั่น 2 วินาทีแล้วหยุด (แต่จุดแดงยังอยู่)
        setTimeout(() => {
            fab.classList.remove('fab-vibrating');
        }, 2000);
    }
}

// 6. โครงสร้าง Regex พื้นฐาน (เดี๋ยวเราจะมาเขียน Logic ดักข้อความกันใน Phase ต่อไป)
function processMessageRegex(message) {
    // ตัวอย่าง Regex ดักจับ [Line: ข้อความ]
    const lineRegex = /\[Line:\s*(.*?)\]/gi;

    // ตรวจสอบว่ามีข้อความตรงเงื่อนไขไหม (เดี๋ยวมาต่อเติม)
    if (lineRegex.test(message)) {
        triggerNotification();
    }
    return message;
}

// ฟังก์ชันเริ่มต้นทำงานเมื่อโหลด Extension
jQuery(async () => {
    console.log("📱 ST Virtual Phone Extension Loaded!");

    createPhoneUI();
    setupSettingsMenu();

    // TODO: ใน Phase หน้า เราจะ Hook เข้ากับ Event ของ ST เพื่อดักจับข้อความตอน AI ตอบกลับ
});
