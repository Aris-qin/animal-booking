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
