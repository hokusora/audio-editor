let wavesurfer, wsRegions;
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null; 
let originalFileName = "Audio";

const { createFFmpeg } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

async function init() {
    showLoading(true, "Đang khởi tạo Studio...");
    if (!ffmpeg.isLoaded()) await ffmpeg.load();

    // --- TẠO GRADIENT DREAMY CHO WAVEFORM ---
    const ctx = document.createElement('canvas').getContext('2d');
    
    // Gradient cho sóng chưa phát (Hồng -> Cam nhạt)
    const waveGradient = ctx.createLinearGradient(0, 0, 0, 150);
    waveGradient.addColorStop(0, '#ffc3a0'); // Cam phấn ở trên
    waveGradient.addColorStop(1, '#ffafbd'); // Hồng phấn ở dưới

    // Gradient cho sóng đã phát (Đậm hơn chút để nổi bật)
    const progressGradient = ctx.createLinearGradient(0, 0, 0, 150);
    progressGradient.addColorStop(0, '#ff9a44'); // Cam đậm
    progressGradient.addColorStop(1, '#fc6767'); // Hồng đậm/Đỏ san hô

    wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: waveGradient,      // Áp dụng gradient
        progressColor: progressGradient,
        cursorColor: '#fff',          // Kim màu trắng cho nổi
        height: 160,
        barWidth: 3,                  // Sóng dày hơn chút cho mềm mại
        barRadius: 3,                 // Bo tròn đầu sóng
        normalize: true,
        minPxPerSec: 50,
        backend: 'MediaElement'
    });

    wsRegions = wavesurfer.registerPlugin(WaveSurfer.Regions.create());

    wavesurfer.on('timeupdate', (t) => {
        document.getElementById('currentTime').innerText = fmtTime(t);
    });

    // --- TÔ MÀU PASTEL DREAMY CHO THANH KÉO & VÙNG CHỌN ---
    wsRegions.on('region-created', (region) => {
        styleRegionDreamy(region);
    });
    
    wsRegions.on('region-updated', (region) => {
        const startInput = document.getElementById('startTime');
        const endInput = document.getElementById('endTime');
        if (document.activeElement !== startInput) startInput.value = region.start.toFixed(3);
        if (document.activeElement !== endInput) endInput.value = region.end.toFixed(3);
    });

    showLoading(false);
}
init();

// --- HÀM STYLE DREAMY (QUAN TRỌNG) ---
function styleRegionDreamy(region) {
    setTimeout(() => {
        const regionEl = region.element; 
        if (!regionEl) return;

        // Màu nền vùng chọn: Gradient Hồng-Cam trong suốt
        regionEl.style.background = 'linear-gradient(to right, rgba(255, 173, 204, 0.2), rgba(255, 204, 153, 0.2))';
        regionEl.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        regionEl.style.backdropFilter = 'blur(2px)'; // Hiệu ứng mờ ảo nhẹ

        const leftHandle = regionEl.querySelector('[data-region-handle="start"]');
        const rightHandle = regionEl.querySelector('[data-region-handle="end"]');

        // Thanh Start: Hồng Pastel
        if (leftHandle) {
            leftHandle.style.background = 'linear-gradient(to bottom, #ffadcc, #ff85a2)';
            leftHandle.style.width = '6px';
            // Đổ bóng soft glow hồng
            leftHandle.style.boxShadow = '-2px 0 15px rgba(255, 173, 204, 0.8)';
        }
        // Thanh End: Cam Pastel
        if (rightHandle) {
            rightHandle.style.background = 'linear-gradient(to bottom, #ffcc99, #ffa07a)';
            rightHandle.style.width = '6px';
            // Đổ bóng soft glow cam
            rightHandle.style.boxShadow = '2px 0 15px rgba(255, 204, 153, 0.8)';
        }
    }, 50);
}

// --- CÁC LOGIC CŨ GIỮ NGUYÊN ---
const startInput = document.getElementById('startTime');
const endInput = document.getElementById('endTime');
startInput.addEventListener('input', updateRegionFromInput);
endInput.addEventListener('input', updateRegionFromInput);

function updateRegionFromInput() {
    const s = parseFloat(startInput.value);
    const e = parseFloat(endInput.value);
    if (isNaN(s) || isNaN(e)) return;
    const regions = wsRegions.getRegions();
    if (regions.length > 0) {
        if (s < e) regions[0].setOptions({ start: s, end: e });
    }
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    originalFileName = file.name.replace(/\.[^/.]+$/, ""); 
    showLoading(true, "Đang phân tích sóng âm...");
    const url = URL.createObjectURL(file);
    await wavesurfer.load(url);
    const ab = await file.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(ab);
    wsRegions.clearRegions();
    wsRegions.addRegion({
        start: audioBuffer.duration * 0.1, end: audioBuffer.duration * 0.9, drag: true, resize: true
    });
    showLoading(false);
});

document.getElementById('previewSpeed').addEventListener('input', function() {
    const val = parseFloat(this.value);
    document.getElementById('speedDisplay').innerText = val + 'x';
    wavesurfer.setPlaybackRate(val, true); 
});

document.getElementById('previewVolume').addEventListener('input', function() {
    const val = parseInt(this.value);
    document.getElementById('volDisplay').innerText = val + '%';
    wavesurfer.setVolume(val / 100);
});

async function exportFile() {
    if (!audioBuffer) return alert("Chưa có file!");
    showLoading(true, "Đang xử lý & Xuất file...");

    try {
        const r = wsRegions.getRegions()[0];
        const mode = document.getElementById('cutMode').value;
        const speed = parseFloat(document.getElementById('previewSpeed').value);
        const volumePercent = parseInt(document.getElementById('previewVolume').value);
        const volumeFactor = volumePercent / 100;

        const rate = audioBuffer.sampleRate;
        const s = Math.floor(r.start * rate);
        const e = Math.floor(r.end * rate);
        let newLen = (mode === 'keep') ? (e - s) : (audioBuffer.length - (e - s));
        let newBuf = audioContext.createBuffer(audioBuffer.numberOfChannels, newLen, rate);

        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            const oldD = audioBuffer.getChannelData(i);
            const newD = newBuf.getChannelData(i);
            if (mode === 'keep') newD.set(oldD.slice(s, e));
            else { newD.set(oldD.slice(0, s)); newD.set(oldD.slice(e), s); }
        }

        const wavData = bufferToWave(newBuf);
        const fname = 'temp.wav';
        const outFmt = document.getElementById('format').value;
        const outName = `output.${outFmt}`;
        
        ffmpeg.FS('writeFile', fname, wavData);

        let filterChain = [];
        if (speed !== 1.0) filterChain.push(`atempo=${speed}`);
        if (volumeFactor !== 1.0) filterChain.push(`volume=${volumeFactor}`);

        let args = ['-i', fname];
        if (filterChain.length > 0) args.push('-filter:a', filterChain.join(','));
        args.push('-b:a', document.getElementById('bitrate').value);
        args.push(outName);

        await ffmpeg.run(...args);

        const data = ffmpeg.FS('readFile', outName);
        const blob = new Blob([data.buffer], { type: `audio/${outFmt}` });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${originalFileName}_2.${outFmt}`;
        a.click();

        ffmpeg.FS('unlink', fname);
        ffmpeg.FS('unlink', outName);

    } catch (err) {
        alert("Lỗi: " + err.message); console.error(err);
    }
    showLoading(false);
}

function playPause() { wavesurfer.playPause(); }
function skip(s) { wavesurfer.skip(s); }
document.getElementById('zoomSlider').addEventListener('input', function(){ wavesurfer.zoom(Number(this.value)); });

function bufferToWave(abuffer) {
    let numOfChan = abuffer.numberOfChannels, len = abuffer.length * numOfChan * 2 + 44, buffer = new ArrayBuffer(len), view = new DataView(buffer), channels = [], i, sample, offset = 0, pos = 0;
    writeStr(view, 0, 'RIFF'); view.setUint32(4, 36 + abuffer.length * numOfChan * 2, true); writeStr(view, 8, 'WAVE'); writeStr(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numOfChan, true); view.setUint32(24, abuffer.sampleRate, true); view.setUint32(28, abuffer.sampleRate * 2 * numOfChan, true); view.setUint16(32, numOfChan * 2, true); view.setUint16(34, 16, true); writeStr(view, 36, 'data'); view.setUint32(40, abuffer.length * numOfChan * 2, true);
    for(i=0; i<abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));
    while(pos < abuffer.length) {
        for(i=0; i<numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][pos]));
            sample = (0.5+sample < 0 ? sample*32768 : sample*32767)|0;
            view.setInt16(44+offset, sample, true); offset+=2;
        } pos++;
    }
    return new Uint8Array(buffer);
}
function writeStr(v, o, s) { for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); }
function fmtTime(s) { return new Date(s*1000).toISOString().substr(14, 9); }
function showLoading(show, txt) { 
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'; 
    if(txt) document.getElementById('loadingText').innerText = txt;
}