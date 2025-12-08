/**
 * Copy for AI - Universal component for all documentation pages
 * Extracts page content in LLM-friendly markdown format
 *
 * Usage: Include this script in any HTML page and add the button:
 * <button onclick="copyForAI()" class="copy-ai-btn">📋 Copy for AI</button>
 */

function copyForAI() {
    // Get page metadata
    const title = document.querySelector('title')?.textContent || 'AI Maestro Documentation';
    const description = document.querySelector('meta[name="description"]')?.content || '';
    const url = window.location.href;

    // Extract main content - try multiple selectors
    let mainContent = '';

    // Try to get article, main, or body content
    const contentElement = document.querySelector('article') ||
                          document.querySelector('main') ||
                          document.querySelector('body');

    if (contentElement) {
        // Clone to avoid modifying original
        const clone = contentElement.cloneNode(true);

        // Remove script tags, style tags, nav, footer
        clone.querySelectorAll('script, style, nav, footer, .hamburger, .mobile-menu').forEach(el => el.remove());

        // Convert HTML to markdown-ish format
        mainContent = htmlToMarkdown(clone);
    }

    // Build LLM-friendly content
    const llmContent = `# ${title}

**URL:** ${url}
**Description:** ${description}

---

${mainContent}

---

**About AI Maestro:**
AI Maestro is an open-source dashboard for orchestrating multiple AI coding agents (Claude Code, Aider, Cursor, GitHub Copilot) from one unified interface. Version 0.14.0, MIT License.

**GitHub:** https://github.com/23blocks-OS/ai-maestro
**Website:** https://ai-maestro.23blocks.com

**Question for AI:** Based on this documentation, please help me understand [YOUR QUESTION HERE]
`;

    // Copy to clipboard
    navigator.clipboard.writeText(llmContent).then(() => {
        // Show success feedback
        showCopyFeedback('✅ Copied! Paste into ChatGPT, Claude, or any AI assistant');
    }).catch(err => {
        // Fallback for older browsers
        fallbackCopy(llmContent);
    });
}

/**
 * Convert HTML to markdown-like text
 */
function htmlToMarkdown(element) {
    let markdown = '';

    // Process each child node
    Array.from(element.children).forEach(child => {
        const tagName = child.tagName?.toLowerCase();

        if (tagName === 'h1') {
            markdown += `\n# ${child.textContent.trim()}\n\n`;
        } else if (tagName === 'h2') {
            markdown += `\n## ${child.textContent.trim()}\n\n`;
        } else if (tagName === 'h3') {
            markdown += `\n### ${child.textContent.trim()}\n\n`;
        } else if (tagName === 'h4') {
            markdown += `\n#### ${child.textContent.trim()}\n\n`;
        } else if (tagName === 'p') {
            markdown += `${child.textContent.trim()}\n\n`;
        } else if (tagName === 'ul' || tagName === 'ol') {
            child.querySelectorAll('li').forEach(li => {
                markdown += `- ${li.textContent.trim()}\n`;
            });
            markdown += '\n';
        } else if (tagName === 'pre' || tagName === 'code') {
            markdown += `\`\`\`\n${child.textContent.trim()}\n\`\`\`\n\n`;
        } else if (tagName === 'blockquote') {
            markdown += `> ${child.textContent.trim()}\n\n`;
        } else if (tagName === 'section' || tagName === 'div') {
            // Recursively process sections and divs
            markdown += htmlToMarkdown(child);
        } else {
            // Default: just get text content
            const text = child.textContent?.trim();
            if (text) {
                markdown += `${text}\n\n`;
            }
        }
    });

    return markdown;
}

/**
 * Show visual feedback when content is copied
 */
function showCopyFeedback(message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: 'Space Grotesk', system-ui, sans-serif;
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(toast);

    // Add slide-in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Fallback copy method for older browsers
 */
function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        showCopyFeedback('✅ Copied! Paste into your AI assistant');
    } catch (err) {
        alert('Unable to copy. Please copy manually.');
    }

    document.body.removeChild(textarea);
}

// Make function globally available
window.copyForAI = copyForAI;
