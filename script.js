// 字母表，用于生成笼位行号
const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ⭐️ 关键修复：定义区域配置，包括区域ID前缀和行字母起始索引
const areaConfigs = [
    { containerId: 'mice-area-a', areaName: '小鼠区1', prefix: '1', startRowCharIndex: 0, rows: 8, cols: 3, type: 'mouse' }, // 行从A开始，如 1-A1
    { containerId: 'mice-area-b', areaName: '小鼠区2', prefix: '2', startRowCharIndex: 1, rows: 8, cols: 4, type: 'mouse' }, // 行从B开始，如 2-B1
    { containerId: 'mice-area-c', areaName: '小鼠区3', prefix: '3', startRowCharIndex: 2, rows: 8, cols: 4, type: 'mouse' }, // 行从C开始，如 3-C1
    { containerId: 'rats-area', areaName: '大鼠区', prefix: '4', startRowCharIndex: 3, rows: 5, cols: 3, type: 'rat' }    // 行从D开始，如 4-D1
];

// ⭐️ 修改generateCagesForArea函数以接收配置对象
function generateCagesForArea(config) {
    const container = document.getElementById(config.containerId);
    if (!container) {
        console.error(`Container with ID ${config.containerId} not found.`);
        return;
    }
    container.innerHTML = '';
    
    for (let row = 0; row < config.rows; row++) {
        for (let col = 1; col <= config.cols; col++) {
            // 根据区域配置的起始索引生成行字母
            const rowLetter = rowLetters[config.startRowCharIndex + row];
            // ⭐️ 新的笼位ID格式：前缀-行字母列号 (例如: 1-A1)
            const cageId = `${config.prefix}-${rowLetter}${col}`;
            const cage = createCageElement(cageId, config.type, config.containerId);
            container.appendChild(cage);
        }
    }
}

// ⭐️ 修改generateAllCages函数以使用新的区域配置
function generateAllCages() {
    areaConfigs.forEach(config => generateCagesForArea(config));
}

function createCageElement(id, type, area) {
    const cage = document.createElement('div');
    cage.className = 'cage';
    cage.dataset.cageId = id;
    cage.dataset.type = type;
    cage.dataset.area = area; // 保持原有的区域ID，用于分类
    
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

// ⭐️ 修改sortCageIds函数以解析新的笼位ID格式
function sortCageIds(cageIds) {
    return cageIds.sort((a, b) => {
        // 解析笼位ID，例如 "1-A1" -> { prefix: 1, rowChar: 'A', col: 1 }
        const parseCageId = (id) => {
            const parts = id.split('-'); // ["1", "A1"]
            if (parts.length !== 2) return null; 

            const prefix = parseInt(parts[0]); 
            const rowCharCol = parts[1]; 

            const match = rowCharCol.match(/([A-Z]+)(\d+)/); // 匹配字母和数字 (例如: "A", "1")
            if (!match) return null;

            const rowChar = match[1];
            const col = parseInt(match[2]);
            return { prefix, rowChar, col };
        };

        const parsedA = parseCageId(a);
        const parsedB = parseCageId(b);

        // 如果解析失败，则按原始字符串排序（不应发生）
        if (!parsedA || !parsedB) {
            return a.localeCompare(b);
        }

        // 首先按区域前缀排序 (1, 2, 3...)
        if (parsedA.prefix !== parsedB.prefix) {
            return parsedA.prefix - parsedB.prefix;
        }

        // 然后按行字母排序 (A, B, C...)
        if (parsedA.rowChar !== parsedB.rowChar) {
            return parsedA.rowChar.localeCompare(parsedB.rowChar);
        }

        // 最后按列号排序 (1, 2, 3...)
        return parsedA.col - parsedB.col;
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

// ⭐️ 修改updateStats函数以动态计算总笼位数
function updateStats() {
    let emptyCount = 0, occupiedCount = 0, longTermCount = 0;
    // 动态计算所有区域的总笼位数
    const totalCages = areaConfigs.reduce((sum, config) => sum + (config.rows * config.cols), 0);
    
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

// ==================== GitHub配置 ====================
let GITHUB_USER = 'Aris-qin';
let GITHUB_REPO = 'animal-booking';
let GITHUB_TOKEN = localStorage.getItem('github_token') || null;

if (!GITHUB_TOKEN) {
    GITHUB_TOKEN = prompt('请输入你的 GitHub Personal Access Token:\n(从 https://github.com/settings/tokens 获取)');
    if (GITHUB_TOKEN) {
        localStorage.setItem('github_token', GITHUB_TOKEN);
    } else {
        alert('未提供 Token，系统将使用本地存储模式');
        GITHUB_TOKEN = null;
    }
}

const DATA_FILE = 'cageData.json';
// ⭐️ 修正：API_URL使用反引号
const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${DATA_FILE}`;

// ==================== 全局变量 ====================
let cageData = {};
let currentEditingCage = null;
let batchMode = false;
let selectedCages = new Set();
let lastSync = 0;
const SYNC_INTERVAL = 5000;

// ==================== GitHub数据操作 ====================
async function loadData() {
    console.log('[加载] 从GitHub获取数据...');
    try {
        if (!GITHUB_TOKEN) {
            console.warn('未提供 GitHub Token，将使用本地缓存加载数据。');
            const cached = localStorage.getItem('cageData');
            cageData = cached ? JSON.parse(cached) : {};
            console.log('✓ 从本地缓存加载数据成功');
            return;
        }
        
        const response = await fetch(API_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                // ⭐️ 关键修复：GET请求需要这个Accept头来获取文件元数据（包括sha）
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.status === 404) {
            console.log('文件不存在，初始化为空。');
            cageData = {};
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
        }
        
        const fileData = await response.json(); // fileData现在是包含sha、content等的对象
        console.log('[DEBUG] loadData 获取到的文件元数据:', fileData);

        if (fileData && fileData.content) {
            // ⭐️ 关键修复：需要base64解码内容
            const decodedContent = atob(fileData.content);
            cageData = JSON.parse(decodedContent) || {};
            console.log('✓ 从GitHub加载数据成功并解码');
        } else {
            console.warn('未能从GitHub文件数据中获取到有效内容，初始化为空。', fileData);
            cageData = {};
        }
    } catch(e) {
        console.error('✗ GitHub加载失败:', e.message);
        const cached = localStorage.getItem('cageData');
        cageData = cached ? JSON.parse(cached) : {};
        console.log('使用本地缓存');
    }
}

async function saveData() {
    localStorage.setItem('cageData', JSON.stringify(cageData));
    
    if (!GITHUB_TOKEN) {
        console.log('[保存] 无GitHub Token，仅保存本地。');
        return;
    }
    
    // 防抖处理，避免频繁上传
    if (Date.now() - lastSync < SYNC_INTERVAL) {
        console.log('[保存] 本地保存完成，GitHub防抖中...');
        return;
    }
    
    console.log('[保存] 开始上传到GitHub...');
    try {
        console.log('[DEBUG] 尝试获取文件SHA...');
        
        // ⭐️ 关键修复：使用正确的 Accept 头获取文件元数据
        const getResponse = await fetch(API_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json' // ⭐️ 必须用这个！
            }
        });
        
        let sha = null;
        if (getResponse.ok) {
            const fileData = await getResponse.json();
            console.log('[DEBUG] 获取到的文件数据:', fileData);
            if (fileData && fileData.sha) {
                sha = fileData.sha;
                console.log('[DEBUG] 成功获取SHA:', sha);
            } else {
                console.warn('[DEBUG] 未从文件数据中获取到SHA，fileData:', fileData);
            }
        } else if (getResponse.status === 404) {
            console.log('[DEBUG] 文件不存在，准备创建。');
        } else {
            console.error(`[DEBUG] 获取文件元数据失败: ${getResponse.status} ${getResponse.statusText}`);
            const errorText = await getResponse.text(); 
            console.error('[DEBUG] 获取文件元数据失败详情:', errorText);
            throw new Error(`获取文件元数据失败: ${getResponse.status}`); 
        }
        
        // ⭐️ 关键修复：动态构建请求体并进行Base64编码
        const requestBody = {
            message: `🔄 更新笼位数据 ${new Date().toLocaleString('zh-CN')}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(cageData, null, 2))))
        };
        
        // ⭐️ 只在 sha 存在时才添加（更新文件需要sha，创建文件不需要）
        if (sha) {
            requestBody.sha = sha;
            console.log('[DEBUG] 添加SHA到请求体。');
        } else {
            console.log('[DEBUG] 不添加SHA，使用创建模式。');
        }
        
        console.log('[DEBUG] 发送PUT请求...');
        
        const updateResponse = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json', // GitHub API期望这个Content-Type
                 'Accept': 'application/vnd.github.v3+json' // 也可在此处添加Accept头
            },
            body: JSON.stringify(requestBody)
        });
        
        if (updateResponse.ok) {
            console.log('✓ 数据已上传到GitHub');
            lastSync = Date.now();
        } else {
            const errorData = await updateResponse.json();
            console.error('✗ GitHub上传失败:', errorData.message);
            throw new Error(`GitHub上传失败: ${errorData.message}`);
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
    
    // 每隔一段时间自动同步
    setInterval(async () => {
        console.log('[定时] 自动同步GitHub数据...');
        await loadData();
        updateAllCages();
        updateStats();
    }, SYNC_INTERVAL);
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
