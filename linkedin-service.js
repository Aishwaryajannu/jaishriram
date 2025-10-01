const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
require('dotenv').config();

const app = express();
app.use(express.json());

const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir);
}

const randomDelay = (min = 1000, max = 3000) => {
  return new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));
};

// Download media from URL
// Download media from URL
const downloadMedia = (url, filepath) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath); // <-- clean path only

    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        return reject(new Error(`Download failed: ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {}); // cleanup
      reject(err);
    });
  });
};


app.post('/post-to-linkedin', async (req, res) => {
  const { content, media_url } = req.body;
  
  if (!content) {
    return res.status(400).json({ success: false, error: 'Content is required' });
  }
  
  let browser;
  const debugLog = [];
  let mediaPath = null;
  
  try {
    console.log('Starting LinkedIn company page posting...');
    debugLog.push('Starting process');
    
    // Download media if provided
   if (media_url) {
  console.log('Downloading media...');

  // Remove query params before extracting extension
  const cleanUrl = media_url.split('?')[0];
  const ext = path.extname(cleanUrl) || '.jpg';

  mediaPath = path.join(screenshotDir, `upload${ext}`);
  await downloadMedia(media_url, mediaPath); // still pass full URL here
  debugLog.push(`Media downloaded: ${mediaPath}`);
}

    
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    
    // Login
    console.log('Logging in...');
    debugLog.push('Navigating to login');
    await page.goto('https://www.linkedin.com/login', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    await page.screenshot({ path: path.join(screenshotDir, '1-login-page.png') });
    
    await page.fill('#username', process.env.LINKEDIN_EMAIL);
    await randomDelay(1000, 2000);
    await page.fill('#password', process.env.LINKEDIN_PASSWORD);
    await randomDelay(1000, 2000);
    
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    
    await page.screenshot({ path: path.join(screenshotDir, '2-after-login.png') });
    debugLog.push('Login submitted');
    
    const currentUrl = page.url();
    console.log('Current URL after login:', currentUrl);
    
    if (currentUrl.includes('checkpoint') || currentUrl.includes('challenge')) {
      throw new Error('LinkedIn security checkpoint detected. Manual verification required.');
    }
    
    // Navigate to company admin
    console.log('Going to company page...');
    debugLog.push('Navigating to company admin');
    await page.goto('https://www.linkedin.com/company/109024966/admin/page-posts/published/', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    await page.waitForTimeout(8000);
    await page.screenshot({ path: path.join(screenshotDir, '3-company-page.png') });
    
    // Find and click "Start a post" button
    console.log('Looking for Start a post button...');
    let postButtonFound = false;
    
    const startPostSelectors = [
      'button:has-text("Start a post")',
      'button[aria-label*="Start a post"]',
      '.share-box-feed-entry__trigger',
      'button:has-text("Create a post")'
    ];
    
    for (const selector of startPostSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        postButtonFound = true;
        console.log(`Clicked start post button: ${selector}`);
        debugLog.push(`Start post clicked: ${selector}`);
        break;
      } catch (e) {
        console.log(`Selector ${selector} not found`);
      }
    }
    
    if (!postButtonFound) {
      throw new Error('Could not find Start a post button');
    }
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotDir, '4-modal-opened.png') });
    
    // Wait for editor modal to appear
    console.log('Waiting for editor...');
    const editorSelectors = [
      '.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[data-placeholder*="Share"]'
    ];
    
    let editor = null;
    for (const selector of editorSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        editor = await page.$(selector);
        if (editor) {
          console.log(`Found editor: ${selector}`);
          debugLog.push(`Editor found: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`Editor selector ${selector} not found`);
      }
    }
    
    if (!editor) {
      throw new Error('Could not find text editor');
    }
    
    // Type content
    console.log('Typing content...');
    await editor.click();
    await page.keyboard.type(content, { delay: 50 });
    await randomDelay(2000, 3000);
    
    await page.screenshot({ path: path.join(screenshotDir, '5-content-typed.png') });
    debugLog.push('Content typed');
    
    // Upload media if available
    if (mediaPath && fs.existsSync(mediaPath)) {
      console.log('Uploading media...');
      
      try {
        // Look for media upload button
        const mediaButtonSelectors = [
          'button[aria-label*="Add media"]',
          'button[aria-label*="Add an image"]',
          'button[aria-label*="media"]',
          'input[type="file"][accept*="image"]'
        ];
        
        let mediaUploaded = false;
        
        for (const selector of mediaButtonSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              const tagName = await element.evaluate(el => el.tagName);
              
              if (tagName === 'INPUT') {
                // Direct file input
                await element.setInputFiles(mediaPath);
                mediaUploaded = true;
                console.log('Media uploaded via input');
              } else {
                // Button that opens file picker
                await element.click();
                await randomDelay(1000, 2000);
                
                // Find the file input that appears
                const fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                  await fileInput.setInputFiles(mediaPath);
                  mediaUploaded = true;
                  console.log('Media uploaded via button');
                }
              }
              
              if (mediaUploaded) break;
            }
          } catch (e) {
            console.log(`Media selector ${selector} failed:`, e.message);
          }
        }
        
        if (mediaUploaded) {
          await randomDelay(3000, 5000);
          await page.screenshot({ path: path.join(screenshotDir, '5.5-media-uploaded.png') });
          debugLog.push('Media uploaded');
        } else {
          debugLog.push('Media upload failed - button not found');
        }
      } catch (mediaError) {
        console.log('Media upload error:', mediaError.message);
        debugLog.push(`Media error: ${mediaError.message}`);
      }
    }
    // If media editor shows up, click "Next" before posting
try {
  const nextButtonSelectors = [
    'button:has-text("Next")',
    '[role="dialog"] button:has-text("Next")',
    'div.share-box-footer button:has-text("Next")'
  ];

  let nextClicked = false;

  for (const selector of nextButtonSelectors) {
    try {
      const nextBtn = await page.$(selector);
      if (nextBtn && await nextBtn.isVisible()) {
        console.log('Clicking Next button...');
        await nextBtn.click();
        await page.waitForTimeout(3000); // wait for transition
        nextClicked = true;
        debugLog.push('Clicked Next button after media upload');
        await page.screenshot({ path: path.join(screenshotDir, '5.6-after-next.png') });
        break;
      }
    } catch (e) {
      console.log(`Next selector ${selector} not found`);
    }
  }

  if (!nextClicked) {
    console.log('No Next button found, continuing...');
  }
} catch (e) {
  console.log('Error handling Next button:', e.message);
}

    // Find the CORRECT Post button (in the modal, bottom-right)
    console.log('Looking for Post button in modal...');
    
    // CRITICAL: We need to find the Post button that's INSIDE the modal
    // and NOT the dropdown "Post to anyone" button at the top
    const correctPostSelectors = [
      // Most specific - look for button with exact text "Post" in the share actions area
      '.share-actions__primary-action button:has-text("Post")',
      'button.share-actions__primary-action',
      // Look within the modal/dialog
      '[role="dialog"] button:has-text("Post")',
      'div.share-box-footer button:has-text("Post")',
      // Data attributes
      'button[data-test-id="share-post-button"]',
      'button[aria-label="Post"]'
    ];
    
    let posted = false;
    
    for (const selector of correctPostSelectors) {
      try {
        const postButton = await page.$(selector);
        if (postButton) {
          // Verify it's visible and not the wrong button
          const isVisible = await postButton.isVisible();
          const buttonText = await postButton.textContent();
          
          console.log(`Found button: "${buttonText?.trim()}" with selector: ${selector}`);
          
          // Make sure it says "Post" and not "Post to anyone"
          if (isVisible && buttonText?.trim() === 'Post') {
            console.log('Clicking the correct Post button...');
            await postButton.click();
            posted = true;
            debugLog.push(`Correct Post button clicked: ${selector}`);
            break;
          }
        }
      } catch (e) {
        console.log(`Post selector ${selector} failed:`, e.message);
      }
    }
    
    if (!posted) {
      // Fallback: Click any button with exact text "Post" that's not in dropdown
      console.log('Trying fallback Post button search...');
      const allButtons = await page.$$('button');
      
      for (const btn of allButtons) {
        const text = await btn.textContent();
        const ariaLabel = await btn.getAttribute('aria-label');
        
        if (text?.trim() === 'Post' && !ariaLabel?.includes('anyone') && !ariaLabel?.includes('connections')) {
          const isVisible = await btn.isVisible();
          if (isVisible) {
            console.log('Found Post button via fallback');
            await btn.click();
            posted = true;
            debugLog.push('Post button clicked via fallback');
            break;
          }
        }
      }
    }
    
    if (!posted) {
      throw new Error('Could not find or click the correct Post button');
    }
    
    await page.waitForTimeout(8000);
    await page.screenshot({ path: path.join(screenshotDir, '6-after-post.png') });
    debugLog.push('Post submitted successfully');
    
    console.log('Post published successfully!');
    
    // Cleanup media file
    if (mediaPath && fs.existsSync(mediaPath)) {
      fs.unlinkSync(mediaPath);
    }
    
    res.json({ 
      success: true, 
      message: 'Company post published successfully to DigitalMarkas',
      media_uploaded: !!media_url,
      debug_log: debugLog,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    
    if (browser) {
      try {
        const page = (await browser.contexts())[0]?.pages()[0];
        if (page) {
          await page.screenshot({ path: path.join(screenshotDir, 'error-screenshot.png') });
        }
      } catch (screenshotError) {
        console.log('Could not take error screenshot');
      }
    }
    
    // Cleanup media file on error
    if (mediaPath && fs.existsSync(mediaPath)) {
      fs.unlinkSync(mediaPath);
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      debug_log: debugLog,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'LinkedIn Company Poster' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LinkedIn poster service running on port ${PORT}`);
  console.log(`Screenshots will be saved to: ${screenshotDir}`);
});