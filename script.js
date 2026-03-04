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
        // 获取文件SHA
        const getResponse = await fetch(API_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3'
            }
        });
        
        let sha = null;
        if (getResponse.ok) {
            const fileData = await getResponse.json();
            if (fileData && fileData.sha) {
                sha = fileData.sha;
                console.log('[DEBUG] 获取到SHA:', sha);
            }
        }
        
        // 构建请求体
        const requestBody = {
            message: `🔄 更新笼位数据 ${new Date().toLocaleString('zh-CN')}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(cageData, null, 2))))
        };
        
        // 只有sha存在时才添加
        if (sha) {
            requestBody.sha = sha;
        }
        
        // 上传
        const updateResponse = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (updateResponse.ok) {
            console.log('✓ 数据已上传到GitHub');
            lastSync = Date.now();
        } else {
            const errorData = await updateResponse.json();
            console.error('✗ GitHub上传失败:', errorData.message);
        }
    } catch(e) {
        console.error('✗ 上传异常:', e.message);
    }
}
