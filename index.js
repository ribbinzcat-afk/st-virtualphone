// index.js

// ฟังก์ชันสำหรับสร้าง UI ของโทรศัพท์และปุ่ม
function createPhoneUI() {
    // 1. สร้างปุ่ม Floating
    const floatingBtn = document.createElement('div');
    floatingBtn.id = 'vp-floating-btn';
    floatingBtn.innerHTML = '📱<div class="vp-badge" id="vp-main-badge"></div>';
    document.body.appendChild(floatingBtn);

    // 2. สร้างกรอบโทรศัพท์
    const phoneContainer = document.createElement('div');
    phoneContainer.id = 'vp-phone-container';

    // สร้างหน้าจอ
    const phoneScreen = document.createElement('div');
    phoneScreen.id = 'vp-phone-screen';
    // ใส่แอปจำลองไปก่อน 1 อัน
    phoneScreen.innerHTML = '<div style="padding: 20px; text-align: center; color: #333;">หน้าจอหลัก<br>(รอใส่ไอคอนแอป)</div>';

    phoneContainer.appendChild(phoneScreen);
    document.body.appendChild(phoneContainer);

    // 3. ผูก Event กดปุ่มเพื่อเปิด/ปิดโทรศัพท์
    floatingBtn.addEventListener('click', () => {
        const isHidden = phoneContainer.style.display === 'none' || phoneContainer.style.display === '';
        if (isHidden) {
            phoneContainer.style.display = 'flex'; // เปิดโทรศัพท์
            stopVibration(); // หยุดสั่นเมื่อเปิดดู
        } else {
            phoneContainer.style.display = 'none'; // ปิดโทรศัพท์
        }
    });
}

// ฟังก์ชันจำลองการสั่นและแจ้งเตือน (เอาไว้เทสต์)
function triggerNotification() {
    const btn = document.getElementById('vp-floating-btn');
    const badge = document.getElementById('vp-main-badge');

    btn.classList.add('vp-vibrating'); // ทำให้สั่น
    badge.style.display = 'block'; // โชว์จุดแดง

    // ให้สั่นแค่ 1 วินาทีแล้วหยุด (แต่จุดแดงยังอยู่)
    setTimeout(() => {
        btn.classList.remove('vp-vibrating');
    }, 1000);
}

function stopVibration() {
    const btn = document.getElementById('vp-floating-btn');
    const badge = document.getElementById('vp-main-badge');
    btn.classList.remove('vp-vibrating');
    badge.style.display = 'none'; // ซ่อนจุดแดง
}

// เมื่อ SillyTavern โหลด Extension เสร็จ ให้รันฟังก์ชันสร้าง UI
jQuery(async () => {
    console.log('Virtual Phone Extension Loaded!');
    createPhoneUI();

    // ลองเทสต์การแจ้งเตือนหลังจากโหลดเสร็จ 3 วินาที (ลบออกได้ทีหลัง)
    setTimeout(triggerNotification, 3000);
});
