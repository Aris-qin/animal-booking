// ==================== GitHub配置 ====================
// 从 localStorage 读取 token（用户自己输入）
let GITHUB_USER = 'Aris-qin';
let GITHUB_REPO = 'animal-booking';
let GITHUB_TOKEN = localStorage.getItem('github_token') || null;

// 如果没有 token，提示用户输入
if (!GITHUB_TOKEN) {
    GITHUB_TOKEN = prompt('请输入你的 GitHub Personal Access Token:\n(从 https://github.com/settings/tokens 获取)');
    if (GITHUB_TOKEN) {
        localStorage.setItem('github_token', GITHUB_TOKEN);
    } else {
        alert('未提供 Token，系统将使用本地存储模式');
        GITHUB_TOKEN = null; // 如果用户取消输入，将 GITHUB_TOKEN 设为 null
    }
}

const DATA_FILE = 'cageData.json';
const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${DATA_FILE}`;

// ==================== 全局变量 ====================
let cageData = {};
let currentEditingCage = null;
let batchMode = false;
let selectedCages = new Set();
let lastSync = 0; // 这个变量现在只用于跟踪数据成功上传到 GitHub 的时间
const SYNC_INTERVAL = 5000; // 自动同步间隔

// ==================== GitHub数据操作 ====================
async function loadData() {
    console.log('[加载] 从GitHub获取数据...');
    try {
        if (!GITHUB_TOKEN) {
            throw new Error('No token provided. Cannot fetch from GitHub.');
        }
        
        const response = await fetch(API_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                console.warn('cageData.json 文件不存在，将初始化为空数据。');
                cageData = {};
                return; 
            }
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        cageData = data || {};
        console.log('✓ 从GitHub加载数据成功');
        // 关键改动：这里不再更新 lastSync，lastSync 现在只在成功上传后更新
        // lastSync = Date.now(); // <-- 这一行被移除或注释掉
    } catch(e) {
        console.error('✗ GitHub加载失败:', e.message);
        const cached = localStorage.getItem('cageData');
        cageData = cached ? JSON.parse(cached) : {};
        console.log('使用本地缓存');
    }
}

async function saveData() {
    // 本地保存（快）
    localStorage.setItem('cageData', JSON.stringify(cageData));
    
    if (!GITHUB_TOKEN) {
        console.log('[保存] 无GitHub Token，仅保存本地');
        return;
    }
    
    // 防抖：5秒内不再重复上传 GitHub
    if (Date.now() - lastSync < 5000) {
        console.log('[保存] 本地保存完成，GitHub防抖中...');
        return;
    }
    
    console.log('[保存] 开始上传到GitHub...');
    try {
        // 先尝试获取文件的 SHA 值
        const getResponse = await fetch(API_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3'
            }
        });
        
        let sha = null;
        if (getResponse.ok) { // 如果文件存在，获取 SHA
            const fileData = await getResponse.json();
            sha = fileData.sha; 
        } else if (getResponse.status === 404) { // 如果文件不存在，sha 保持 null，这是预期行为
            console.log(`[保存] ${DATA_FILE} 不存在于GitHub仓库，将创建新文件。`);
            // sha 仍然为 null，表示是创建操作
        } else { // 其他非 200 和非 404 的错误
            throw new Error(`Failed to get file SHA: ${getResponse.status} ${getResponse.statusText}`);
        }
        
        // 构建请求体，根据 sha 是否存在决定是否包含 sha 字段
        const requestBody = {
            message: `🔄 更新笼位数据 ${new Date().toLocaleString('zh-CN')}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(cageData, null, 2)))) // base64编码
        };

        if (sha) { // 只有在 sha 存在时才添加 sha 字段 (即更新文件时)
            requestBody.sha = sha;
        }

        // 上传或更新数据
        const updateResponse = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody) // 使用修改后的请求体
        });
        
        if (updateResponse.ok) {
            console.log('✓ 数据已上传到GitHub');
            lastSync = Date.now(); 
        } else {
            const errorData = await updateResponse.json();
            console.error('✗ GitHub上传失败:', errorData.message || updateResponse.statusText);
        }
    } catch(e) {
        console.error('✗ 上传异常:', e.message);
    }
}

// ==================== 初始化函数 ====================
async function init() {
    console.log('🚀 页面初始化中...');
    
    await loadData();
    generateAllCages();
    updateAllCages();
    updateStats();
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('singleStartDate').value = today;
    document.getElementById('batchStartDate').value = today;
    
    console.log('✓ 页面初始化完成');
    
    // 定时同步
    setInterval(async () => {
        console.log('[定时] 自动同步GitHub数据...');
        await loadData();
        updateAllCages();
        updateStats();
    }, SYNC_INTERVAL);
}

// ==================== 笼位生成函数 ====================
function generateAllCages() {
    generateCagesForArea('mice-area-a', 8, 3, 'mouse');
    generateCagesForArea('mice-area-b', 8, 4, 'mouse');
    generateCagesForArea('mice-area-c', 8, 4, 'mouse');
    generateCagesForArea('rats-area', 5, 3, 'rat');
}

function generateCagesForArea(containerId, rows, cols, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    
    for (let row = 0; row < rows; row++) {
        for (let col = 1; col <= cols; col++) {
            const rowLetter = rowLetters[row];
            const cageId = `${rowLetter}${col}`;
            const cage = createCageElement(cageId, type, containerId);
            container.appendChild(cage);
        }
    }
}

function createCageElement(id, type, area) {
    const cage = document.createElement('div');
    cage.className = 'cage';
    cage.dataset.cageId = id;
    cage.dataset.type = type;
    cage.dataset.area = area;
    
    cage.innerHTML = `
        <div class="cage-label">${id}</div>
        <div class="cage-status status-empty">空闲</div>
        <div class="user-info">暂无使用者</div>
        <div class="date-info">-</div>
        <div class="duration-bar">
            <div class="duration-fill" style="width: 0%"></div>
        </div>
    `;
    
    cage.addEventListener('click', function(e) {
        e.stopPropagation();
        if (batchMode) {
            toggleCageSelection(id);
        } else {
            openSingleModal(id);
        }
    });
    
    return cage;
}

// ==================== 批量模式函数 ====================
function toggleBatchMode() {
    batchMode = !batchMode;
    const controls = document.getElementById('batchControls');
    const button = document.getElementById('batchModeBtn');
    const btnText = document.getElementById('batchModeText');
    
    if (batchMode) {
        controls.classList.add('active');
        button.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)';
        btnText.textContent = '退出批量模式';
        document.querySelectorAll('.cage').forEach(cage => {
            cage.style.cursor = 'crosshair';
        });
    } else {
        controls.classList.remove('active');
        button.style.background = '';
        btnText.textContent = '进入批量选择模式';
        document.querySelectorAll('.cage').forEach(cage => {
            cage.style.cursor = 'pointer';
            cage.classList.remove('selected');
        });
        clearSelection();
    }
}

function toggleCageSelection(cageId) {
    const cageElement = document.querySelector(`[data-cage-id="${cageId}"]`);
    const data = cageData[cageId];
    
    if (data && data.userName) {
        alert(`笼位 ${cageId} 已被使用者 ${data.userName} 占用，不能选择！`);
        return;
    }
    
    if (selectedCages.has(cageId)) {
        selectedCages.delete(cageId);
        cageElement.classList.remove('selected');
    } else {
        selectedCages.add(cageId);
        cageElement.classList.add('selected');
    }
    
    updateSelectionInfo();
}

function updateSelectionInfo() {
    const info = document.getElementById('selectionInfo');
    const count = document.getElementById('selectedCount');
    info.textContent = `已选择 ${selectedCages.size} 个笼位`;
    count.textContent = selectedCages.size;
    
    const listContainer = document.getElementById('selectedCagesList');
    if (selectedCages.size > 0) {
        const sortedCages = sortCageIds(Array.from(selectedCages));
        listContainer.innerHTML = sortedCages
            .map(cageId => `<span class="selected-cage-tag">${cageId}</span>`)
            .join('');
    } else {
        listContainer.innerHTML = '<span style="color: #999;">暂未选择任何笼位</span>';
    }
}

function sortCageIds(cageIds) {
    return cageIds.sort((a, b) => {
        const matchA = a.match(/([A-Z]+)(\d+)/);
        const matchB = b.match(/([A-Z]+)(\d+)/);
        if (!matchA || !matchB) return 0;
        
        const rowA = matchA[1];
        const colA = parseInt(matchA[2]);
        const rowB = matchB[1];
        const colB = parseInt(matchB[2]);
        
        if (rowA !== rowB) return rowA.localeCompare(rowB);
        return colA - colB;
    });
}

function clearSelection() {
    selectedCages.forEach(cageId => {
        const cageElement = document.querySelector(`[data-cage-id="${cageId}"]`);
        if (cageElement) cageElement.classList.remove('selected');
    });
    selectedCages.clear();
    updateSelectionInfo();
}

function batchBookCages() {
    if (selectedCages.size === 0) {
        alert('请先选择要预约的笼位！');
        return;
    }
    document.getElementById('batchModal').style.display = 'block';
    updateSelectionInfo();
}

// ==================== 模态框函数 ====================
function openSingleModal(cageId) {
    if (batchMode) return;
    
    currentEditingCage = cageId;
    const data = cageData[cageId];
    const modal = document.getElementById('singleCageModal');
    const title = document.getElementById('singleModalTitle');
    
    title.textContent = `笼位 ${cageId} 信息`;
    
    if (data) {
        document.getElementById('singleUserName').value = data.userName || '';
        document.getElementById('singleStartDate').value = data.startDate || '';
        document.getElementById('singleEndDate').value = data.endDate || '';
        document.getElementById('singleAnimalType').value = data.animalType || '';
        document.getElementById('singleExperimentDesc').value = data.experimentDesc || '';
    } else {
        document.getElementById('singleCageForm').reset();
        document.getElementById('singleStartDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('singleAnimalType').value = '';
    }
    
    modal.style.display = 'block';
}

function closeSingleModal() {
    document.getElementById('singleCageModal').style.display = 'none';
    currentEditingCage = null;
}

function closeBatchModal() {
    document.getElementById('batchModal').style.display = 'none';
}

// ==================== 数据更新函数 ====================
function updateCageDisplay(cageId) {
    const data = cageData[cageId];
    const cageElement = document.querySelector(`[data-cage-id="${cageId}"]`);
    
    if (!cageElement) return;
    
    const statusElement = cageElement.querySelector('.cage-status');
    const userInfoElement = cageElement.querySelector('.user-info');
    const dateInfoElement = cageElement.querySelector('.date-info');
    const durationFillElement = cageElement.querySelector('.duration-fill');
    
    if (!data || !data.userName) {
        statusElement.textContent = '空闲';
        statusElement.className = 'cage-status status-empty';
        userInfoElement.textContent = '暂无使用者';
        dateInfoElement.textContent = '-';
        durationFillElement.style.width = '0%';
        durationFillElement.className = 'duration-fill';
        cageElement.style.background = 'white';
        return;
    }
    
    const startDate = new Date(data.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    const daysUsed = Math.max(0, Math.floor((today - startDate) / (1000 * 60 * 60 * 24)));
    
    let statusText, statusClass, durationClass;
    
    if (daysUsed <= 7) {
        statusText = `占用${daysUsed}天`;
        statusClass = 'status-occupied';
        durationClass = 'short-term';
    } else {
        statusText = `长期占用${daysUsed}天`;
        statusClass = 'status-long-term';
        durationClass = 'long-term';
    }
    
    statusElement.textContent = statusText;
    statusElement.className = `cage-status ${statusClass}`;
    userInfoElement.textContent = `使用者: ${data.userName}`;
    
    let dateText = `开始: ${data.startDate}`;
    if (data.endDate) dateText += ` | 结束: ${data.endDate}`;
    if (data.experimentDesc) dateText += `\n${data.experimentDesc}`;
    dateInfoElement.textContent = dateText;
    
    const maxDays = 30; 
    const percentage = Math.min((daysUsed / maxDays) * 100, 100);
    durationFillElement.style.width = `${percentage}%`;
    durationFillElement.className = `duration-fill ${durationClass}`;
}

function updateAllCages() {
    document.querySelectorAll('.cage').forEach(cageElement => {
        const cageId = cageElement.dataset.cageId;
        updateCageDisplay(cageId);
    });
}


function updateStats() {
    let emptyCount = 0, occupiedCount = 0, longTermCount = 0;
    const totalCages = (8 * 3) + (8 * 4) + (8 * 4) + (5 * 3); 
    
    Object.keys(cageData).forEach(cageId => {
        const data = cageData[cageId];
        if (data && data.userName) {
            const startDate = new Date(data.startDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            startDate.setHours(0, 0, 0, 0);
            const daysUsed = Math.max(0, Math.floor((today - startDate) / (1000 * 60 * 60 * 24)));
            
            occupiedCount++;
            if (daysUsed > 7) longTermCount++;
        }
    });
    
    emptyCount = totalCages - occupiedCount;
    
    document.getElementById('statEmpty').textContent = emptyCount;
    document.getElementById('statOccupied').textContent = occupiedCount;
    document.getElementById('statLong').textContent = longTermCount;
}

function terminateSingleCage() {
    if (currentEditingCage && confirm(`确定要终止笼位 ${currentEditingCage} 的占用吗？`)) {
        delete cageData[currentEditingCage];
        saveData();
        updateCageDisplay(currentEditingCage);
        updateStats();
        closeSingleModal();
        alert('笼位占用已终止！');
    }
}

function exportData() {
    const dataStr = JSON.stringify(cageData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json; charset=utf-8'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `动物房笼位数据_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function clearAllData() {
    if (confirm('确定要清空所有笼位数据吗？此操作不可恢复！')) {
        cageData = {};
        saveData();
        updateAllCages();
        updateStats();
        clearSelection();
        alert('所有数据已清空！');
    }
}

// ==================== 表单提交 ====================
document.getElementById('singleCageForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (!currentEditingCage) return;
    
    const animalType = document.getElementById('singleAnimalType').value;
    if (!animalType) {
        alert('请选择动物类型！');
        return;
    }
    
    const formData = {
        userName: document.getElementById('singleUserName').value,
        startDate: document.getElementById('singleStartDate').value,
        endDate: document.getElementById('singleEndDate').value,
        animalType: animalType,
        experimentDesc: document.getElementById('singleExperimentDesc').value,
        lastUpdated: new Date().toISOString()
    };
    
    cageData[currentEditingCage] = formData;
    saveData();
    updateCageDisplay(currentEditingCage);
    updateStats();
    closeSingleModal();
    
    alert('笼位信息保存成功！');
});

document.getElementById('batchCageForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (selectedCages.size === 0) {
        alert('没有选中的笼位！');
        return;
    }
    
    const animalType = document.getElementById('batchAnimalType').value;
    if (!animalType) {
        alert('请选择动物类型！');
        return;
    }
    
    const formData = {
        userName: document.getElementById('batchUserName').value,
        startDate: document.getElementById('batchStartDate').value,
        endDate: document.getElementById('batchEndDate').value,
        animalType: animalType,
        experimentDesc: document.getElementById('batchExperimentDesc').value,
        lastUpdated: new Date().toISOString()
    };
    
    selectedCages.forEach(cageId => {
        cageData[cageId] = {...formData};
    });
    
    saveData();
    selectedCages.forEach(updateCageDisplay);
    updateStats();
    const count = selectedCages.size;
    clearSelection();
    closeBatchModal();
    
    alert(`成功预约 ${count} 个笼位！`);
});

// ==================== 模态框事件 ====================
window.addEventListener('click', function(e) {
    const singleModal = document.getElementById('singleCageModal');
    const batchModal = document.getElementById('batchModal');
    
    if (e.target === singleModal) closeSingleModal();
    if (e.target === batchModal) closeBatchModal();
});

// ==================== 页面初始化 ====================
document.addEventListener('DOMContentLoaded', init);
