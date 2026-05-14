// ==================== 字母表和区域配置 ====================
const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// 区域配置：保持当前笼位编号规则，不再做任何编号迁移
const areaConfigs = [
    { containerId: 'mice-area-a', areaName: '小鼠区1', prefix: '1', startRowCharIndex: 0, rows: 8, cols: 3, type: 'mouse' },
    { containerId: 'mice-area-b', areaName: '小鼠区2', prefix: '2', startRowCharIndex: 0, rows: 8, cols: 4, type: 'mouse' },
    { containerId: 'mice-area-c', areaName: '小鼠区3', prefix: '3', startRowCharIndex: 0, rows: 8, cols: 4, type: 'mouse' },
    { containerId: 'rats-area', areaName: '大鼠区', prefix: '4', startRowCharIndex: 0, rows: 5, cols: 3, type: 'rat' }
];

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
const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${DATA_FILE}`;
const SYNC_INTERVAL = 5000;

// ==================== 全局变量 ====================
let cageData = {};
let currentEditingCage = null;
let batchMode = false;
let selectedCages = new Set();
let lastSync = 0;

// ==================== UTF-8 Base64 编解码，修复中文乱码 ====================
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';

    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary);
}

function base64ToUtf8(b64) {
    const cleanBase64 = b64.replace(/\s/g, '');
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new TextDecoder('utf-8').decode(bytes);
}

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
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            console.log('GitHub 上 cageData.json 不存在，初始化为空。');
            cageData = {};
            return;
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
        }

        const fileData = await response.json();

        if (fileData && fileData.content) {
            const decodedContent = base64ToUtf8(fileData.content);

            try {
                cageData = JSON.parse(decodedContent) || {};
                console.log('✓ 从GitHub加载数据成功');

                // 重要：这里不再迁移、不再修改笼位编号，保留 JSON 中原始 key
                localStorage.setItem('cageData', JSON.stringify(cageData));
            } catch (jsonError) {
                console.error('✗ JSON解析失败:', jsonError);
                throw jsonError;
            }
        } else {
            console.warn('GitHub 文件内容为空，初始化为空。');
            cageData = {};
        }
    } catch (e) {
        console.error('✗ GitHub加载失败:', e.message);

        const cached = localStorage.getItem('cageData');
        cageData = cached ? JSON.parse(cached) : {};

        console.log('已使用本地缓存数据');
    }
}

async function saveData() {
    localStorage.setItem('cageData', JSON.stringify(cageData));

    if (!GITHUB_TOKEN) {
        console.log('[保存] 无GitHub Token，仅保存本地。');
        return;
    }

    if (Date.now() - lastSync < SYNC_INTERVAL) {
        console.log('[保存] 本地保存完成，GitHub防抖中...');
        return;
    }

    console.log('[保存] 开始上传到GitHub...');

    try {
        const getResponse = await fetch(API_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let sha = null;

        if (getResponse.ok) {
            const fileData = await getResponse.json();
            sha = fileData.sha || null;
        } else if (getResponse.status === 404) {
            console.log('GitHub 上文件不存在，将创建新文件。');
        } else {
            const errorText = await getResponse.text();
            throw new Error(`获取文件元数据失败: ${getResponse.status} - ${errorText}`);
        }

        const rawJsonContent = JSON.stringify(cageData, null, 2);
        const base64Content = utf8ToBase64(rawJsonContent);

        const requestBody = {
            message: `更新笼位数据 ${new Date().toLocaleString('zh-CN')}`,
            content: base64Content
        };

        if (sha) {
            requestBody.sha = sha;
        }

        const updateResponse = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(requestBody)
        });

        if (updateResponse.ok) {
            console.log('✓ 数据已上传到GitHub');
            lastSync = Date.now();
        } else {
            const errorData = await updateResponse.json();
            throw new Error(`GitHub上传失败: ${errorData.message}`);
        }
    } catch (e) {
        console.error('✗ 上传异常:', e.message);
    }
}

// ==================== 初始化函数 ====================
async function init() {
    console.log('页面初始化中...');

    await loadData();

    generateAllCages();
    updateAllCages();
    updateStats();

    const today = new Date().toISOString().split('T')[0];

    const singleStartDate = document.getElementById('singleStartDate');
    const batchStartDate = document.getElementById('batchStartDate');

    if (singleStartDate) singleStartDate.value = today;
    if (batchStartDate) batchStartDate.value = today;

    console.log('✓ 页面初始化完成');

    setInterval(async () => {
        console.log('[定时] 自动同步GitHub数据...');
        await loadData();
        updateAllCages();
        updateStats();
    }, SYNC_INTERVAL);
}

// ==================== 笼位生成函数 ====================
function generateAllCages() {
    areaConfigs.forEach(config => generateCagesForArea(config));
}

function generateCagesForArea(config) {
    const container = document.getElementById(config.containerId);

    if (!container) {
        console.error(`Container with ID ${config.containerId} not found.`);
        return;
    }

    container.innerHTML = '';

    for (let row = 0; row < config.rows; row++) {
        for (let col = 1; col <= config.cols; col++) {
            const rowLetter = rowLetters[config.startRowCharIndex + row];
            const cageId = `${config.prefix}-${rowLetter}${col}`;
            const cage = createCageElement(cageId, config.type, config.containerId);
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
        if (cageElement) cageElement.classList.remove('selected');
    } else {
        selectedCages.add(cageId);
        if (cageElement) cageElement.classList.add('selected');
    }

    updateSelectionInfo();
}

function updateSelectionInfo() {
    const info = document.getElementById('selectionInfo');
    const count = document.getElementById('selectedCount');
    const listContainer = document.getElementById('selectedCagesList');

    if (info) info.textContent = `已选择 ${selectedCages.size} 个笼位`;
    if (count) count.textContent = selectedCages.size;

    if (!listContainer) return;

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
        const parseCageId = (id) => {
            const parts = id.split('-');

            if (parts.length !== 2) return null;

            const prefix = parseInt(parts[0], 10);
            const match = parts[1].match(/([A-Z]+)(\d+)/);

            if (!match) return null;

            return {
                prefix,
                rowChar: match[1],
                col: parseInt(match[2], 10)
            };
        };

        const parsedA = parseCageId(a);
        const parsedB = parseCageId(b);

        if (!parsedA || !parsedB) {
            return a.localeCompare(b);
        }

        if (parsedA.prefix !== parsedB.prefix) {
            return parsedA.prefix - parsedB.prefix;
        }

        if (parsedA.rowChar !== parsedB.rowChar) {
            return parsedA.rowChar.localeCompare(parsedB.rowChar);
        }

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

    const batchModal = document.getElementById('batchModal');

    if (batchModal) {
        batchModal.style.display = 'block';
    }

    updateSelectionInfo();
}

// ==================== 模态框函数 ====================
function openSingleModal(cageId) {
    if (batchMode) return;

    currentEditingCage = cageId;

    const data = cageData[cageId];
    const modal = document.getElementById('singleCageModal');
    const title = document.getElementById('singleModalTitle');

    if (title) {
        title.textContent = `笼位 ${cageId} 信息`;
    }

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

    if (modal) {
        modal.style.display = 'block';
    }
}

function closeSingleModal() {
    const modal = document.getElementById('singleCageModal');

    if (modal) {
        modal.style.display = 'none';
    }

    currentEditingCage = null;
}

function closeBatchModal() {
    const modal = document.getElementById('batchModal');

    if (modal) {
        modal.style.display = 'none';
    }
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

    let statusText;
    let statusClass;
    let durationClass;

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

    if (data.endDate) {
        dateText += ` | 结束: ${data.endDate}`;
    }

    if (data.experimentDesc) {
        dateText += `\n${data.experimentDesc}`;
    }

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
    let occupiedCount = 0;
    let longTermCount = 0;

    const totalCages = areaConfigs.reduce((sum, config) => {
        return sum + config.rows * config.cols;
    }, 0);

    Object.keys(cageData).forEach(cageId => {
        const data = cageData[cageId];

        if (data && data.userName) {
            const startDate = new Date(data.startDate);
            const today = new Date();

            today.setHours(0, 0, 0, 0);
            startDate.setHours(0, 0, 0, 0);

            const daysUsed = Math.max(0, Math.floor((today - startDate) / (1000 * 60 * 60 * 24)));

            occupiedCount++;

            if (daysUsed > 7) {
                longTermCount++;
            }
        }
    });

    const emptyCount = totalCages - occupiedCount;

    document.getElementById('statEmpty').textContent = emptyCount;
    document.getElementById('statOccupied').textContent = occupiedCount;
    document.getElementById('statLong').textContent = longTermCount;
}

// ==================== 表单提交 ====================
document.addEventListener('DOMContentLoaded', function() {
    const singleCageForm = document.getElementById('singleCageForm');
    const batchCageForm = document.getElementById('batchCageForm');

    if (singleCageForm) {
        singleCageForm.addEventListener('submit', function(e) {
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
    }

    if (batchCageForm) {
        batchCageForm.addEventListener('submit', function(e) {
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
                cageData[cageId] = { ...formData };
            });

            saveData();
            selectedCages.forEach(updateCageDisplay);
            updateStats();

            const count = selectedCages.size;

            clearSelection();
            closeBatchModal();

            alert(`成功预约 ${count} 个笼位！`);
        });
    }

    init();
});

// ==================== 终止占用功能 ====================
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

// ==================== 数据导出 ====================
function exportData() {
    const dataStr = JSON.stringify(cageData, null, 2);
    const dataBlob = new Blob([dataStr], {
        type: 'application/json;charset=utf-8'
    });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `动物房笼位数据_${new Date().toISOString().split('T')[0]}.json`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

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

// ==================== 模态框事件 ====================
window.addEventListener('click', function(e) {
    const singleModal = document.getElementById('singleCageModal');
    const batchModal = document.getElementById('batchModal');

    if (e.target === singleModal) {
        closeSingleModal();
    }

    if (e.target === batchModal) {
        closeBatchModal();
    }
});
