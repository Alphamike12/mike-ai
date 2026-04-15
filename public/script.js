(function () {
  "use strict";

  const STORE = {
    token: "mike-ai-token",
    user: "mike-ai-user",
    model: "mike-ai-selected-model",
    settings: "mike-ai-settings-pro",
    chats: "mike-ai-chats-pro",
    activeChat: "mike-ai-active-chat-pro",
  };

  const LIMITS = {
    maxImages: 4,
    maxDimension: 1280,
    quality: 0.9,
  };

  const QUICK_PROMPTS = [
    "Build a 30-day JavaScript roadmap.",
    "Analyze this image and summarize key details.",
    "Think step-by-step to solve this task.",
    "Search latest AI news and summarize.",
    "Continue our previous conversation about...",
    "What did we discuss yesterday?",
    "Tell me more about your capabilities.",
    "Help me understand this topic better.",
  ];

  const state = {
    sending: false,
    token: localStorage.getItem(STORE.token),
    user: parseJSON(localStorage.getItem(STORE.user)),
    settings: {
      enterToSend: true,
      autoScroll: true,
      theme: "light",
      fontSize: "medium",
      showTimestamps: true,
      defaultModel: "gemma3:270m",
      maxTokens: 1000,
      saveHistory: true,
      ...(parseJSON(localStorage.getItem(STORE.settings)) || {}),
    },
    chats: parseJSON(localStorage.getItem(STORE.chats)) || [],
    activeChatId: localStorage.getItem(STORE.activeChat),
    pendingImages: [],
    listening: false,
    speechRecognition: null,
    abortController: null,
    lastUserInput: "",
    lastRequestPayload: null,
  };

  const el = {
    chatMessages: byId("chat-messages"),
    messageInput: byId("message-input"),
    sendButton: byId("send-button"),
    modelSelect: byId("model-select"),
    typingIndicator: byId("typing-indicator"),
    charCount: byId("char-count"),
    inputStatus: byId("input-status"),
    connectionStatus: byId("connection-status"),
    memoryBtn: byId("memory-btn"),
    clearBtn: byId("clear-btn"),
    helpBtn: byId("help-btn"),
    memoryModal: byId("memory-modal"),
    memoryModalClose: byId("memory-modal-close"),
    memoryContent: byId("memory-content"),
    helpModal: byId("help-modal"),
    helpModalClose: byId("help-modal-close"),
    settingsModal: byId("settings-modal"),
    settingsModalClose: byId("settings-modal-close"),
    loginBtn: byId("login-btn"),
    logoutBtn: byId("logout-btn"),
    userName: byId("user-name"),
    userRole: byId("user-role"),
    userAvatar: byId("user-avatar"),
    searchButton: byId("search-button"),
    uploadButton: byId("upload-button"),
    fileInput: byId("file-input"),
    sidebar: byId("sidebar"),
    sidebarToggle: byId("sidebar-toggle"),
    sidebarNav: document.querySelector(".sidebar-nav"),
    toolItems: document.querySelectorAll(".tool-item"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    enhanceLayout();
    bindEvents();
    setupVoiceRecognition();
    hydrateAuth();
    hydrateModel();
    ensureActiveChat();
    renderChatList();
    renderActiveChat();
    renderAttachmentBar();
    refreshModelList();
    setStatus("Ready");
  }

  function enhanceLayout() {
    if (el.sidebarNav && !byId("chat-history-panel")) {
      const panel = document.createElement("div");
      panel.className = "nav-section";
      panel.id = "chat-history-panel";
      panel.innerHTML =
        '<h4>Chats</h4>' +
        '<div class="tool-item" id="new-chat-btn"><div class="tool-icon">+</div><div class="tool-info"><h5>New Chat</h5><span>Start fresh</span></div></div>' +
        '<div id="chat-list"></div>';
      el.sidebarNav.prepend(panel);
      const newBtn = byId("new-chat-btn");
      if (newBtn) newBtn.addEventListener("click", createNewChat);
    }

    if (el.chatMessages && !byId("prompt-cards")) {
      const prompts = document.createElement("div");
      prompts.id = "prompt-cards";
      prompts.className = "prompt-cards";
      prompts.innerHTML = QUICK_PROMPTS.map((p) => `<button class="prompt-card">${escapeHtml(p)}</button>`).join("");
      prompts.addEventListener("click", (event) => {
        const card = event.target.closest(".prompt-card");
        if (!card || !el.messageInput) return;
        el.messageInput.value = card.textContent || "";
        onInputChanged();
        el.messageInput.focus();
      });
      el.chatMessages.prepend(prompts);
    }

    if (el.sidebarNav && !byId("chat-io-panel")) {
      const panel = document.createElement("div");
      panel.className = "nav-section";
      panel.id = "chat-io-panel";
      panel.innerHTML =
        '<h4>Chat Tools</h4>' +
        '<div class="chat-io-actions">' +
          '<button type="button" class="chat-io-btn" id="export-chat-btn">Export</button>' +
          '<button type="button" class="chat-io-btn" id="import-chat-btn">Import</button>' +
        "</div>" +
        '<input type="file" id="import-chat-file" accept=".json,application/json" style="display:none;" />';
      el.sidebarNav.prepend(panel);
    }

    if (el.messageInput && !byId("attachment-bar")) {
      const bar = document.createElement("div");
      bar.id = "attachment-bar";
      bar.className = "attachment-bar";
      const wrapper = el.messageInput.closest(".input-wrapper");
      if (wrapper) wrapper.insertAdjacentElement("beforebegin", bar);
    }

    if (el.messageInput && !byId("response-actions")) {
      const wrapper = el.messageInput.closest(".input-wrapper");
      if (wrapper) {
        const bar = document.createElement("div");
        bar.id = "response-actions";
        bar.className = "response-actions";
        bar.innerHTML =
          '<button type="button" class="response-action-btn" id="retry-edit-button">Edit & Retry</button>' +
          '<button type="button" class="response-action-btn" id="regenerate-button">Regenerate</button>' +
          '<button type="button" class="response-action-btn danger" id="stop-button" style="display:none;">Stop</button>';
        wrapper.insertAdjacentElement("afterend", bar);
      }
    }
    injectVoiceControls();
  }

  function injectVoiceControls() {
    const actions = document.querySelector(".input-actions");
    if (!actions || byId("voice-input-btn")) return;
    const mic = document.createElement("button");
    mic.id = "voice-input-btn";
    mic.className = "action-btn";
    mic.type = "button";
    mic.title = "Voice Input";
    mic.setAttribute("aria-label", "Toggle voice input");

    const speaker = document.createElement("button");
    speaker.id = "voice-output-btn";
    speaker.className = "action-btn";
    speaker.type = "button";
    speaker.title = "Voice Output";
    speaker.setAttribute("aria-label", "Toggle voice output");

    actions.appendChild(mic);
    actions.appendChild(speaker);
  }

  function bindEvents() {
    on("send-button", "click", sendMessage);
    on("message-input", "keydown", onInputKeyDown);
    on("message-input", "input", onInputChanged);
    on("model-select", "change", onModelChange);
    on("clear-btn", "click", clearChatAndMemory);
    on("memory-btn", "click", openMemoryModal);
    on("help-btn", "click", function () {
      toggleModal(el.helpModal, true);
    });
    on("memory-modal-close", "click", function () {
      toggleModal(el.memoryModal, false);
    });
    on("help-modal-close", "click", function () {
      toggleModal(el.helpModal, false);
    });
    on("settings-modal-close", "click", closeSettingsModal);
    on("save-settings-btn", "click", saveSettings);
    on("cancel-settings-btn", "click", closeSettingsModal);
    on("reset-settings-btn", "click", resetSettings);
    on("clear-cache-btn", "click", clearCache);
    
    // Slider value updates
    on("max-tokens", "input", function() {
      updateSliderValue(this);
    });
    on("upload-button", "click", function () {
      if (el.fileInput) el.fileInput.click();
    });
    on("file-input", "change", onFileInput);
    on("voice-input-btn", "click", toggleVoiceInput);
    on("voice-output-btn", "click", toggleVoiceOutput);
    on("search-button", "click", function () {
      presetInput("Search for: ");
    });
    on("sidebar-toggle", "click", function () {
      if (el.sidebar) el.sidebar.classList.toggle("open");
    });
    on("login-btn", "click", function () {
      window.location.href = "login.html";
    });
    on("logout-btn", "click", onLogout);
    on("stop-button", "click", stopGenerating);
    on("regenerate-button", "click", regenerateLastResponse);
    on("retry-edit-button", "click", editAndRetryLastPrompt);
    on("export-chat-btn", "click", exportCurrentChat);
    on("import-chat-btn", "click", function () {
      const picker = byId("import-chat-file");
      if (picker) picker.click();
    });
    on("import-chat-file", "change", onImportChatFile);

    window.addEventListener("keydown", onGlobalShortcuts);
    window.addEventListener("click", function (event) {
      if (event.target === el.memoryModal) toggleModal(el.memoryModal, false);
      if (event.target === el.helpModal) toggleModal(el.helpModal, false);
    });

    bindToolActions();

    if (el.chatMessages) {
      el.chatMessages.addEventListener("click", onChatMessagesClick);
      el.chatMessages.addEventListener("dragover", onDragOver);
      el.chatMessages.addEventListener("dragleave", onDragLeave);
      el.chatMessages.addEventListener("drop", onDropFiles);
    }
  }

  function bindToolActions() {
    const tools = {
      "chat-tool": function () {
        focusInput();
      },
      "upload-tool": function () {
        if (el.fileInput) el.fileInput.click();
      },
      "create-image-tool": function () {
        presetInput("Create an image of ");
      },
      "thinking-tool": function () {
        presetInput("Think step-by-step and explain: ");
      },
      "deepsearch-tool": function () {
        presetInput("Search for: ");
      },
      "profile-tool": function () {
        window.location.href = state.token ? "dashboard.html" : "login.html";
      },
      "dashboard-tool": function () {
        window.location.href = state.token ? "dashboard.html" : "login.html";
      },
      "upgrade-tool": function () {
        toast("Premium features panel can be added next.");
      },
      "settings-tool": openSettingsModal,
    };

    Object.keys(tools).forEach(function (id) {
      const node = byId(id);
      if (!node) return;
      node.addEventListener("click", function () {
        activateTool(id);
        tools[id]();
      });
    });
  }

  async function sendMessage(options) {
    const opts = options || {};
    if (state.sending || !el.messageInput) return;
    let text = (opts.messageOverride || el.messageInput.value || "").trim();
    const hasImages = state.pendingImages.length > 0;
    if (!text && !hasImages) return;
    if (!text && hasImages) text = "Please analyze these images.";

    const chat = getActiveChat();
    const userText = hasImages ? `${text}\n\n[Attached images: ${state.pendingImages.length}]` : text;
    if (!opts.skipUserAppend) {
      chat.messages.push({ role: "user", content: userText, ts: Date.now() });
      chat.title = deriveTitle(chat.messages);
      persistChats();
      appendMessage("user", userText);
      renderChatList();
      state.lastUserInput = text;
    }

    el.messageInput.value = opts.keepInput ? el.messageInput.value : "";
    onInputChanged();
    setSending(true);
    state.abortController = new AbortController();

    try {
      const payload = {
        message: text,
        model: el.modelSelect ? el.modelSelect.value : "gemma3:270m",
        images: state.pendingImages.map((img) => img.base64),
      };
      state.lastRequestPayload = payload;
      const answer = await streamAssistantResponse(payload);
      if (state.settings.voiceReplies) {
        speakText(answer);
      }
      chat.messages.push({ role: "assistant", content: answer, ts: Date.now() });
      chat.title = deriveTitle(chat.messages);
      persistChats();
      renderChatList();
      clearPendingImages();
      setConnection(true);
      setStatus(`Ready · ${payload.model}`);
    } catch (error) {
      if (error && error.name === "AbortError") {
        appendMessage("assistant", "Generation stopped.");
        setStatus("Generation stopped");
      } else {
        appendMessage("assistant", `Error: ${error.message}`);
        setConnection(false);
        setStatus("Request failed");
      }
    } finally {
      state.abortController = null;
      setSending(false);
    }
  }

  async function streamAssistantResponse(payload) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ ...payload, stream: true }),
      signal: state.abortController ? state.abortController.signal : undefined,
    });

    const contentType = String(response.headers.get("content-type") || "");
    if (!response.ok) {
      const data = await response.json().catch(function () {
        return {};
      });
      throw new Error(data.error || data.details || "Request failed");
    }

    if (!contentType.includes("text/event-stream") || !response.body) {
      const data = await response.json();
      const fallbackAnswer = data.response || "No response.";
      await appendAssistantStreaming(fallbackAnswer);
      return fallbackAnswer;
    }

    const nodes = appendMessage("assistant", "");
    if (!nodes.content) return "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let fullText = "";

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      lines.forEach(function (line) {
        const value = line.trim();
        if (!value.startsWith("data:")) return;
        const payloadLine = value.slice(5).trim();
        if (!payloadLine) return;
        if (payloadLine === "[DONE]") return;
        try {
          const part = JSON.parse(payloadLine);
          if (part.error) throw new Error(part.error);
          if (part.delta) {
            fullText += part.delta;
            nodes.content.innerHTML = renderMarkdown(fullText);
            if (nodes.copyBtn) nodes.copyBtn.setAttribute("data-copy-text", fullText);
            if (state.settings.autoScroll && el.chatMessages) {
              el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
            }
          }
        } catch (_) {}
      });
    }

    nodes.content.innerHTML = renderMarkdown(fullText || "No response.");
    if (nodes.copyBtn) nodes.copyBtn.setAttribute("data-copy-text", fullText || "No response.");
    return fullText || "No response.";
  }

  async function appendAssistantStreaming(text) {
    const nodes = appendMessage("assistant", "");
    if (!nodes.content) return;
    for (let i = 1; i <= text.length; i += 8) {
      const partial = text.slice(0, i);
      nodes.content.innerHTML = renderMarkdown(partial);
      if (nodes.copyBtn) nodes.copyBtn.setAttribute("data-copy-text", partial);
      if (state.settings.autoScroll && el.chatMessages) el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
      await sleep(14);
    }
    nodes.content.innerHTML = renderMarkdown(text);
    if (nodes.copyBtn) nodes.copyBtn.setAttribute("data-copy-text", text);
  }

  function appendMessage(role, content) {
    if (!el.chatMessages) return { body: null, content: null, copyBtn: null };
    removeWelcome();
    const row = document.createElement("div");
    row.className = role === "user" ? "message user-message" : "message bot-message";
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? initials(state.user && state.user.name) : "AI";
    const body = document.createElement("div");
    body.className = "message-content";
    const textNode = document.createElement("div");
    textNode.className = "message-text";
    textNode.innerHTML = renderMarkdown(content);
    const meta = document.createElement("div");
    meta.className = "message-meta";
    appendTime(meta);
    let copyBtn = null;
    if (role === "assistant") {
      // Add feedback buttons
      const feedbackContainer = document.createElement("div");
      feedbackContainer.className = "message-feedback";
      
      const likeBtn = document.createElement("button");
      likeBtn.type = "button";
      likeBtn.className = "message-action-btn like-btn";
      likeBtn.innerHTML = "👍";
      likeBtn.setAttribute("aria-label", "Like this response");
      
      const unlikeBtn = document.createElement("button");
      unlikeBtn.type = "button";
      unlikeBtn.className = "message-action-btn unlike-btn";
      unlikeBtn.innerHTML = "👎";
      unlikeBtn.setAttribute("aria-label", "Unlike this response");
      
      feedbackContainer.appendChild(likeBtn);
      feedbackContainer.appendChild(unlikeBtn);
      meta.appendChild(feedbackContainer);
      
      copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-message-btn";
      copyBtn.setAttribute("data-copy-text", String(content || ""));
      copyBtn.textContent = "Copy";
      meta.appendChild(copyBtn);
    }
    body.appendChild(textNode);
    body.appendChild(meta);
    row.appendChild(avatar);
    row.appendChild(body);
    el.chatMessages.appendChild(row);
    if (state.settings.autoScroll) el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    return { body, content: textNode, copyBtn };
  }

  function renderMarkdown(text) {
    const source = String(text || "").replace(/\r\n/g, "\n");
    const chunks = [];
    const codeRegex = /```([\w#+.-]*)\n?([\s\S]*?)```/g;
    let last = 0;
    let match;

    while ((match = codeRegex.exec(source)) !== null) {
      if (match.index > last) chunks.push(renderTextBlock(source.slice(last, match.index)));
      const id = `code_${Math.random().toString(36).slice(2, 8)}`;
      const lang = escapeHtml(match[1] || "");
      const code = escapeHtml((match[2] || "").trim());
      chunks.push(
        `<div class="code-block-wrap">` +
          `<button class="copy-code-btn" data-code-id="${id}">Copy</button>` +
          `<pre data-code-id="${id}"><code class="lang-${lang}">${code}</code></pre>` +
        `</div>`
      );
      last = codeRegex.lastIndex;
    }
    if (last < source.length) chunks.push(renderTextBlock(source.slice(last)));
    return chunks.filter(Boolean).join("");
  }

  function renderTextBlock(text) {
    const lines = String(text || "").split("\n");
    const out = [];
    let listType = null;
    let quoteOpen = false;

    function closeList() {
      if (listType) out.push(`</${listType}>`);
      listType = null;
    }
    function closeQuote() {
      if (quoteOpen) out.push("</blockquote>");
      quoteOpen = false;
    }

    lines.forEach(function (line) {
      const raw = line.trimEnd();
      const trimmed = raw.trim();

      if (!trimmed) {
        closeList();
        closeQuote();
        return;
      }

      const ordered = trimmed.match(/^(\d+)\.\s+(.+)$/);
      const unordered = trimmed.match(/^[-*]\s+(.+)$/);
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      const quote = trimmed.match(/^>\s?(.+)$/);

      if (heading) {
        closeList();
        closeQuote();
        const level = heading[1].length;
        out.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        return;
      }

      if (quote) {
        closeList();
        if (!quoteOpen) {
          out.push("<blockquote>");
          quoteOpen = true;
        }
        out.push(`<p>${renderInlineMarkdown(quote[1])}</p>`);
        return;
      }

      closeQuote();

      if (ordered) {
        if (listType !== "ol") {
          closeList();
          listType = "ol";
          out.push("<ol>");
        }
        out.push(`<li>${renderInlineMarkdown(ordered[2])}</li>`);
        return;
      }

      if (unordered) {
        if (listType !== "ul") {
          closeList();
          listType = "ul";
          out.push("<ul>");
        }
        out.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
        return;
      }

      closeList();
      out.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    });

    closeList();
    closeQuote();
    return out.join("");
  }

  function renderInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_m, label, url) {
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    return html;
  }

  function onChatMessagesClick(event) {
    onCopyCode(event);
    onCopyMessage(event);
    onFeedbackClick(event);
  }

  function onCopyCode(event) {
    const button = event.target.closest(".copy-code-btn");
    if (!button || !el.chatMessages) return;
    const id = button.getAttribute("data-code-id");
    const code = el.chatMessages.querySelector(`pre[data-code-id="${id}"] code`);
    if (!code) return;
    navigator.clipboard.writeText(code.textContent || "");
    button.textContent = "Copied";
    setTimeout(function () {
      button.textContent = "Copy";
    }, 1000);
  }

  function onCopyMessage(event) {
    const button = event.target.closest(".copy-message-btn");
    if (!button) return;
    const text = button.getAttribute("data-copy-text") || "";
    navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    setTimeout(function () {
      button.textContent = "Copy";
    }, 900);
  }

  function onFeedbackClick(event) {
    const likeBtn = event.target.closest(".like-btn");
    const unlikeBtn = event.target.closest(".unlike-btn");
    
    if (!likeBtn && !unlikeBtn) return;
    
    const messageElement = event.target.closest(".bot-message");
    if (!messageElement) return;
    
    // Remove existing feedback states
    const existingLike = messageElement.querySelector(".like-btn");
    const existingUnlike = messageElement.querySelector(".unlike-btn");
    
    if (likeBtn) {
      if (likeBtn.classList.contains("liked")) {
        // Remove like
        likeBtn.classList.remove("liked");
        unlikeBtn.classList.remove("disliked");
        sendFeedback("neutral");
      } else {
        // Add like
        likeBtn.classList.add("liked");
        unlikeBtn.classList.remove("disliked");
        sendFeedback("like");
      }
    } else if (unlikeBtn) {
      if (unlikeBtn.classList.contains("disliked")) {
        // Remove unlike
        unlikeBtn.classList.remove("disliked");
        likeBtn.classList.remove("liked");
        sendFeedback("neutral");
      } else {
        // Add unlike
        unlikeBtn.classList.add("disliked");
        likeBtn.classList.remove("liked");
        sendFeedback("dislike");
      }
    }
  }

  function sendFeedback(feedbackType) {
    // Store feedback locally (you could also send this to a server)
    const feedbackData = {
      type: feedbackType,
      timestamp: Date.now(),
      messageId: generateMessageId(),
      model: state.settings.selectedModel || 'default'
    };
    
    // Store in localStorage for analytics
    const existingFeedback = parseJSON(localStorage.getItem('mike-ai-feedback')) || [];
    existingFeedback.push(feedbackData);
    localStorage.setItem('mike-ai-feedback', JSON.stringify(existingFeedback));
    
    // Show toast confirmation
    const message = feedbackType === 'like' ? '👍 Thanks for your feedback!' : 
                   feedbackType === 'dislike' ? '👎 Thanks for your feedback!' : 
                   'Feedback removed';
    toast(message);
  }

  function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // Suggest follow-up conversations based on memory
  function suggestFollowUp(type) {
    const messageInput = el.messageInput;
    if (!messageInput) return;
    
    switch(type) {
      case 'continue':
        messageInput.value = "Continue our previous conversation. What were we discussing last time?";
        break;
      case 'explore':
        messageInput.value = "Based on our previous conversations, what related topics should we explore?";
        break;
      case 'summarize':
        messageInput.value = "Can you summarize what we've talked about so far?";
        break;
    }
    
    onInputChanged();
    messageInput.focus();
    toggleModal(el.memoryModal, false);
  }

  async function onFileInput(event) {
    const files = Array.from(event.target.files || []);
    await queueImages(files);
    if (el.fileInput) el.fileInput.value = "";
  }

  async function queueImages(files) {
    const remaining = LIMITS.maxImages - state.pendingImages.length;
    const images = files.filter((f) => f.type && f.type.startsWith("image/")).slice(0, remaining);
    if (!images.length) return toast("Only image files are supported.");
    const prepared = await Promise.all(images.map(prepareImage));
    state.pendingImages.push(...prepared);
    renderAttachmentBar();
    setStatus(`${state.pendingImages.length} image(s) attached`);
  }

  async function prepareImage(file) {
    const dataUrl = await readAsDataUrl(file);
    const compressed = await compressDataUrl(dataUrl);
    return { name: file.name, base64: compressed.split(",")[1] || "" };
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(new Error("File read failed"));
      };
      reader.readAsDataURL(file);
    });
  }

  function compressDataUrl(dataUrl) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        const ratio = Math.min(1, LIMITS.maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", LIMITS.quality));
      };
      img.onerror = function () {
        resolve(dataUrl);
      };
      img.src = dataUrl;
    });
  }

  function onDragOver(event) {
    event.preventDefault();
    if (el.chatMessages) el.chatMessages.classList.add("dragover");
  }

  function onDragLeave(event) {
    event.preventDefault();
    if (el.chatMessages) el.chatMessages.classList.remove("dragover");
  }

  async function onDropFiles(event) {
    event.preventDefault();
    if (el.chatMessages) el.chatMessages.classList.remove("dragover");
    await queueImages(Array.from((event.dataTransfer && event.dataTransfer.files) || []));
  }

  function renderAttachmentBar() {
    const bar = byId("attachment-bar");
    if (!bar) return;
    if (!state.pendingImages.length) {
      bar.innerHTML = "";
      return;
    }
    bar.innerHTML = state.pendingImages
      .map((img, i) => `<div class="attachment-chip"><span>${escapeHtml(img.name)}</span><button data-remove="${i}">x</button></div>`)
      .join("");
    bar.querySelectorAll("button[data-remove]").forEach((btn) => {
      btn.addEventListener("click", function () {
        const i = Number(btn.getAttribute("data-remove"));
        state.pendingImages.splice(i, 1);
        renderAttachmentBar();
      });
    });
  }

  function clearPendingImages() {
    state.pendingImages = [];
    renderAttachmentBar();
  }

  function ensureActiveChat() {
    if (!state.chats.length) state.chats.push(makeChat());
    if (!state.activeChatId || !state.chats.some((c) => c.id === state.activeChatId)) {
      state.activeChatId = state.chats[0].id;
    }
    persistChats();
  }

  function makeChat() {
    return { id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, title: "New Chat", messages: [] };
  }

  function getActiveChat() {
    let chat = state.chats.find((c) => c.id === state.activeChatId);
    if (!chat) {
      chat = makeChat();
      state.chats.unshift(chat);
      state.activeChatId = chat.id;
      persistChats();
    }
    return chat;
  }

  function createNewChat() {
    const chat = makeChat();
    state.chats.unshift(chat);
    state.activeChatId = chat.id;
    persistChats();
    renderChatList();
    renderActiveChat();
    clearPendingImages();
    setStatus("New chat started");
  }

  function renderChatList() {
    const list = byId("chat-list");
    if (!list) return;
    list.innerHTML = state.chats
      .slice(0, 20)
      .map((chat) => `<button class="chat-list-item ${chat.id === state.activeChatId ? "active" : ""}" data-chat="${chat.id}">${escapeHtml(chat.title || "Untitled")}</button>`)
      .join("");
    list.querySelectorAll("button[data-chat]").forEach((button) => {
      button.addEventListener("click", function () {
        state.activeChatId = button.getAttribute("data-chat");
        persistChats();
        renderChatList();
        renderActiveChat();
      });
    });
  }

  function renderActiveChat() {
    if (!el.chatMessages) return;
    el.chatMessages.innerHTML = "";
    const cards = document.createElement("div");
    cards.id = "prompt-cards";
    cards.className = "prompt-cards";
    cards.innerHTML = QUICK_PROMPTS.map((p) => `<button class="prompt-card">${escapeHtml(p)}</button>`).join("");
    cards.addEventListener("click", (event) => {
      const card = event.target.closest(".prompt-card");
      if (!card || !el.messageInput) return;
      el.messageInput.value = card.textContent || "";
      onInputChanged();
      focusInput();
    });
    el.chatMessages.appendChild(cards);
    getActiveChat().messages.forEach((m) => appendMessage(m.role, m.content));
  }

  function deriveTitle(messages) {
    const first = messages.find((m) => m.role === "user");
    if (!first) return "New Chat";
    const text = first.content.replace(/\[Attached images:.*?\]/g, "").replace(/\s+/g, " ").trim();
    if (!text) return "New Chat";
    return text.length > 42 ? `${text.slice(0, 42)}...` : text;
  }

  function persistChats() {
    localStorage.setItem(STORE.chats, JSON.stringify(state.chats.slice(0, 30)));
    localStorage.setItem(STORE.activeChat, state.activeChatId || "");
  }

  async function openMemoryModal() {
    toggleModal(el.memoryModal, true);
    if (el.memoryContent) el.memoryContent.innerHTML = "<p>Loading memory context...</p>";
    try {
      const response = await fetch("/api/memory");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Memory fetch failed");
      const s = data.statistics || {};
      const topics = ((data.memory && data.memory.recentTopics) || []).slice(0, 8);
      const recentConversations = (data.memory && data.memory.recentConversations) || [];
      const userPatterns = data.userPatterns || {};
      
      if (el.memoryContent) {
        let memoryHTML = `
          <div class="memory-overview">
            <h4>Conversation Statistics</h4>
            <p><strong>Total Conversations:</strong> ${s.totalConversations || 0}</p>
            <p><strong>Today:</strong> ${s.todayConversations || 0}</p>
            <p><strong>This Week:</strong> ${s.thisWeekConversations || 0}</p>
            <p><strong>Memory Size:</strong> ${s.memorySize || 0} bytes</p>
          </div>
          
          <div class="recent-topics">
            <h4>Recent Topics</h4>
            <p>${topics.length ? topics.map(escapeHtml).join(", ") : "No topics yet"}</p>
          </div>
          
          <div class="conversation-history">
            <h4>Recent Conversations</h4>
        `;
        
        if (recentConversations.length > 0) {
          recentConversations.slice(-5).forEach(conv => {
            const date = new Date(conv.timestamp).toLocaleDateString();
            const topicList = conv.topics ? conv.topics.join(', ') : 'general';
            memoryHTML += `
              <div class="memory-item">
                <p><strong>${date}:</strong> ${topicList}</p>
                <p class="memory-preview">${escapeHtml(conv.message.substring(0, 100))}...</p>
              </div>
            `;
          });
        } else {
          memoryHTML += '<p>No recent conversations</p>';
        }
        
        memoryHTML += `
          </div>
          
          <div class="user-patterns">
            <h4>Your Patterns</h4>
            <p><strong>Preferred Topics:</strong> ${Object.keys(userPatterns.preferredTopics || {}).join(', ') || 'None detected'}</p>
            <p><strong>Active Hours:</strong> ${userPatterns.activeHours ? userPatterns.activeHours.slice(-3).join(', ') : 'Not detected'}</p>
            <p><strong>Communication Style:</strong> ${userPatterns.communicationStyle || 'Friendly'}</p>
          </div>
          
          <div class="conversation-starters">
            <h4>Suggested Follow-ups</h4>
            <button class="memory-action-btn" onclick="suggestFollowUp('continue')">Continue Previous Topic</button>
            <button class="memory-action-btn" onclick="suggestFollowUp('explore')">Explore Related Topics</button>
            <button class="memory-action-btn" onclick="suggestFollowUp('summarize')">Summarize Our Conversations</button>
          </div>
        `;
        
        el.memoryContent.innerHTML = memoryHTML;
      }
    } catch (error) {
      if (el.memoryContent) el.memoryContent.innerHTML = `<p>Error: ${escapeHtml(error.message)}</p>`;
    }
  }

  function clearChatAndMemory() {
    if (!confirm("Clear this chat and server memory?")) return;
    const chat = getActiveChat();
    chat.messages = [];
    chat.title = "New Chat";
    persistChats();
    renderChatList();
    renderActiveChat();
    fetch("/api/memory/clear", { method: "POST", headers: buildHeaders() }).catch(() => {});
    setStatus("Cleared");
  }

  function openSettingsModal() {
    toast("Settings panel can be expanded next. Current shortcuts: Ctrl/Cmd+N, Ctrl/Cmd+K, Esc.");
  }

  function onGlobalShortcuts(event) {
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createNewChat();
      return;
    }
    if (ctrl && event.key.toLowerCase() === "k") {
      event.preventDefault();
      focusInput();
      return;
    }
    if (event.key === "Escape") {
      toggleModal(el.helpModal, false);
      toggleModal(el.memoryModal, false);
      stopVoiceInput();
      if (state.sending) stopGenerating();
    }
  }

  function stopGenerating() {
    if (state.abortController) state.abortController.abort();
  }

  function regenerateLastResponse() {
    const chat = getActiveChat();
    if (!chat || !chat.messages.length) return toast("No message to regenerate.");
    const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
    if (!lastUser || !lastUser.content) return toast("No user prompt found.");
    if (chat.messages[chat.messages.length - 1] && chat.messages[chat.messages.length - 1].role === "assistant") {
      chat.messages.pop();
      if (el.chatMessages) {
        const nodes = el.chatMessages.querySelectorAll(".bot-message");
        const last = nodes[nodes.length - 1];
        if (last) last.remove();
      }
    }
    persistChats();
    sendMessage({ messageOverride: String(lastUser.content).replace(/\n\n\[Attached images:[\s\S]*$/, ""), skipUserAppend: true });
  }

  function editAndRetryLastPrompt() {
    const chat = getActiveChat();
    if (!chat || !chat.messages.length || !el.messageInput) return;
    const userIndex = [...chat.messages].map((m, idx) => ({ ...m, idx })).reverse().find((m) => m.role === "user");
    if (!userIndex) return toast("No prompt to edit.");
    const current = String(userIndex.content || "").replace(/\n\n\[Attached images:[\s\S]*$/, "");
    const next = window.prompt("Edit your last prompt", current);
    if (next === null) return;
    const clean = next.trim();
    if (!clean) return;
    chat.messages = chat.messages.slice(0, userIndex.idx);
    if (el.chatMessages) {
      while (el.chatMessages.lastElementChild && !el.chatMessages.lastElementChild.classList.contains("prompt-cards")) {
        el.chatMessages.lastElementChild.remove();
      }
    }
    persistChats();
    renderChatList();
    el.messageInput.value = clean;
    onInputChanged();
    sendMessage();
  }

  function exportCurrentChat() {
    const chat = getActiveChat();
    if (!chat) return;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      chat,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${chat.title || "chat"}.json`.replace(/[^\w.-]+/g, "_");
    link.click();
    URL.revokeObjectURL(url);
    toast("Chat exported.");
  }

  async function onImportChatFile(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const imported = data && data.chat ? data.chat : data;
      if (!imported || !Array.isArray(imported.messages)) throw new Error("Invalid chat file");
      const chat = {
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: String(imported.title || "Imported Chat"),
        messages: imported.messages
          .filter((m) => m && (m.role === "user" || m.role === "assistant"))
          .map((m) => ({ role: m.role, content: String(m.content || ""), ts: Number(m.ts) || Date.now() })),
      };
      state.chats.unshift(chat);
      state.activeChatId = chat.id;
      persistChats();
      renderChatList();
      renderActiveChat();
      toast("Chat imported.");
    } catch (error) {
      toast(`Import failed: ${error.message}`);
    } finally {
      if (event && event.target) event.target.value = "";
    }
  }

  function setupVoiceRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      updateVoiceButtons();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = function (event) {
      if (!el.messageInput) return;
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const txt = event.results[i][0] ? event.results[i][0].transcript : "";
        if (event.results[i].isFinal) finalText += txt;
        else interim += txt;
      }
      const combined = (finalText || interim).trim();
      if (combined) {
        const current = el.messageInput.value.trim();
        el.messageInput.value = current ? `${current} ${combined}` : combined;
        onInputChanged();
      }
    };

    recognition.onstart = function () {
      state.listening = true;
      setStatus("Listening...");
      updateVoiceButtons();
    };

    recognition.onend = function () {
      state.listening = false;
      if (!state.sending) setStatus("Ready");
      updateVoiceButtons();
    };

    recognition.onerror = function () {
      state.listening = false;
      setStatus("Voice input error");
      updateVoiceButtons();
    };

    state.speechRecognition = recognition;
    updateVoiceButtons();
  }

  function toggleVoiceInput() {
    if (!state.speechRecognition) {
      toast("Voice input is not supported in this browser.");
      return;
    }
    if (state.listening) stopVoiceInput();
    else {
      try {
        state.speechRecognition.start();
      } catch (_) {
        setStatus("Voice input unavailable");
      }
    }
  }

  function stopVoiceInput() {
    if (!state.speechRecognition) return;
    try {
      state.speechRecognition.stop();
    } catch (_) {}
    state.listening = false;
    updateVoiceButtons();
  }

  function toggleVoiceOutput() {
    state.settings.voiceReplies = !state.settings.voiceReplies;
    localStorage.setItem(STORE.settings, JSON.stringify(state.settings));
    updateVoiceButtons();
    setStatus(state.settings.voiceReplies ? "Voice replies on" : "Voice replies off");
    if (!state.settings.voiceReplies) {
      window.speechSynthesis.cancel();
    }
  }

  function speakText(text) {
    if (!("speechSynthesis" in window) || !text) return;
    const clean = String(text).replace(/```[\s\S]*?```/g, "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean.slice(0, 1200));
    utter.rate = 1;
    utter.pitch = 1;
    utter.lang = "en-US";
    window.speechSynthesis.speak(utter);
  }

  function updateVoiceButtons() {
    const mic = byId("voice-input-btn");
    const speaker = byId("voice-output-btn");
    if (mic) {
      if (!state.speechRecognition) {
        mic.disabled = true;
        mic.innerHTML = getMicIcon("off");
        mic.title = "Voice input not supported";
      } else {
        mic.disabled = false;
        mic.innerHTML = getMicIcon(state.listening ? "on" : "idle");
        mic.title = state.listening ? "Stop voice input" : "Start voice input";
      }
    }
    if (speaker) {
      speaker.innerHTML = getSpeakerIcon(state.settings.voiceReplies ? "on" : "off");
      speaker.title = state.settings.voiceReplies ? "Disable voice output" : "Enable voice output";
    }
  }

  function getMicIcon(mode) {
    const active = mode === "on";
    const blocked = mode === "off";
    return `<span class="voice-icon ${active ? "voice-active" : ""} ${blocked ? "voice-disabled" : ""}" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    </span>`;
  }

  function getSpeakerIcon(mode) {
    const active = mode === "on";
    return `<span class="voice-icon ${active ? "voice-active" : ""}" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="${active ? "M15.5 8.5a5 5 0 0 1 0 7" : "M15 9l5 6"}"></path>
        <path d="${active ? "M18.5 5.5a9 9 0 0 1 0 13" : "M20 9l-5 6"}"></path>
      </svg>
    </span>`;
  }

  function onInputKeyDown(event) {
    if (state.settings.enterToSend && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function onInputChanged() {
    if (el.charCount && el.messageInput) el.charCount.textContent = String(el.messageInput.value.length);
    if (el.messageInput) {
      el.messageInput.style.height = "auto";
      el.messageInput.style.height = `${Math.min(el.messageInput.scrollHeight, 220)}px`;
    }
  }

  function onModelChange() {
    if (!el.modelSelect) return;
    localStorage.setItem(STORE.model, el.modelSelect.value);
    setStatus("Model updated");
  }

  function hydrateModel() {
    const saved = localStorage.getItem(STORE.model);
    if (!saved || !el.modelSelect) return;
    if (Array.from(el.modelSelect.options).some((o) => o.value === saved)) el.modelSelect.value = saved;
  }

  async function refreshModelList() {
    if (!el.modelSelect) return;
    try {
      const response = await fetch("/api/models");
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.models)) return;
      const existing = new Set(Array.from(el.modelSelect.options).map((o) => o.value));
      data.models.forEach((m) => {
        if (!m || !m.name || existing.has(m.name)) return;
        const option = document.createElement("option");
        option.value = m.name;
        option.textContent = m.name;
        el.modelSelect.appendChild(option);
      });
      hydrateModel();
    } catch (_) {}
  }

  function hydrateAuth() {
    const u = state.user || {};
    const authed = Boolean(state.token && u.email);
    if (el.loginBtn) el.loginBtn.style.display = authed ? "none" : "inline-flex";
    if (el.logoutBtn) el.logoutBtn.style.display = authed ? "inline-flex" : "none";
    if (el.userName) el.userName.textContent = authed ? ([u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username || "User") : "Guest User";
    if (el.userRole) el.userRole.textContent = authed ? `${capitalize(u.subscription || "free")} Plan` : "Free Plan";
    if (el.userAvatar) el.userAvatar.textContent = authed ? initials(el.userName.textContent) : "G";
  }

  function onLogout() {
    localStorage.removeItem(STORE.token);
    localStorage.removeItem(STORE.user);
    state.token = null;
    state.user = null;
    hydrateAuth();
    setStatus("Logged out");
  }

  function applyTheme() {
    document.body.classList.toggle("theme-dark", state.settings.theme === "dark");
  }

  function setStatus(text) {
    if (el.inputStatus) el.inputStatus.textContent = text;
  }

  function setConnection(ok) {
    if (!el.connectionStatus) return;
    const dot = el.connectionStatus.querySelector(".status-dot");
    const txt = el.connectionStatus.querySelector("span:last-child");
    if (dot) {
      dot.classList.toggle("online", ok);
      dot.style.background = ok ? "" : "#ef4444";
    }
    if (txt) txt.textContent = ok ? "Connected" : "Disconnected";
  }

  function setSending(on) {
    state.sending = on;
    if (el.sendButton) el.sendButton.disabled = on;
    if (el.messageInput) el.messageInput.disabled = false;
    const stopBtn = byId("stop-button");
    const regenBtn = byId("regenerate-button");
    const retryBtn = byId("retry-edit-button");
    if (stopBtn) stopBtn.style.display = on ? "inline-flex" : "none";
    if (regenBtn) regenBtn.disabled = on;
    if (retryBtn) retryBtn.disabled = on;
    if (el.typingIndicator) {
      el.typingIndicator.style.display = on ? "flex" : "none";
      el.typingIndicator.classList.toggle("active", on);
    }
    if (on) {
      setStatus("Thinking...");
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  }

  function presetInput(text) {
    if (!el.messageInput) return;
    if (!el.messageInput.value.trim()) el.messageInput.value = text;
    onInputChanged();
    focusInput();
  }

  function focusInput() {
    if (el.messageInput) el.messageInput.focus();
  }

  function removeWelcome() {
    const w = el.chatMessages ? el.chatMessages.querySelector(".welcome-message") : null;
    if (w) w.remove();
  }

  function appendTime(node) {
    const t = document.createElement("div");
    t.className = "message-time";
    t.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    node.appendChild(t);
  }

  function activateTool(id) {
    el.toolItems.forEach((i) => i.classList.remove("active"));
    const target = byId(id);
    if (target) target.classList.add("active");
  }

  function toggleModal(modal, open) {
    if (!modal) return;
    modal.classList.toggle("show", open);
    modal.style.display = open ? "flex" : "none";
  }

  function buildHeaders() {
    const h = { "Content-Type": "application/json" };
    if (state.token) h.Authorization = `Bearer ${state.token}`;
    return h;
  }

  function toast(message) {
    if (!el.chatMessages) return;
    const msg = document.createElement("div");
    msg.className = "system-message";
    msg.innerHTML = `<p>${escapeHtml(message)}</p>`;
    el.chatMessages.appendChild(msg);
    if (state.settings.autoScroll) el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
  }

  function on(id, eventName, handler) {
    const node = byId(id);
    if (node) node.addEventListener(eventName, handler);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function parseJSON(value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch (_) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initials(name) {
    return String(name || "U")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0].toUpperCase())
      .join("");
  }

  function capitalize(v) {
    return v ? v.charAt(0).toUpperCase() + v.slice(1) : "";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Settings Modal Functions
  function openSettingsModal() {
    if (!el.settingsModal) return;
    loadSettingsToForm();
    toggleModal(el.settingsModal, true);
  }

  function closeSettingsModal() {
    if (!el.settingsModal) return;
    toggleModal(el.settingsModal, false);
  }

  function loadSettingsToForm() {
    // Load current settings into the form
    const settings = state.settings;
    
    // Appearance settings
    const themeSelect = byId('theme-select');
    const fontSizeSelect = byId('font-size-select');
    if (themeSelect) themeSelect.value = settings.theme || 'light';
    if (fontSizeSelect) fontSizeSelect.value = settings.fontSize || 'medium';
    
    // Chat behavior settings
    const enterToSend = byId('enter-to-send');
    const autoScroll = byId('auto-scroll');
    const showTimestamps = byId('show-timestamps');
    if (enterToSend) enterToSend.checked = settings.enterToSend !== false;
    if (autoScroll) autoScroll.checked = settings.autoScroll !== false;
    if (showTimestamps) showTimestamps.checked = settings.showTimestamps !== false;
    
    // AI settings
    const defaultModelSelect = byId('default-model-select');
    const maxTokens = byId('max-tokens');
    if (defaultModelSelect) defaultModelSelect.value = settings.defaultModel || 'gemma3:270m';
    if (maxTokens) {
      maxTokens.value = settings.maxTokens || 1000;
      updateSliderValue(maxTokens);
    }
    
    // Privacy settings
    const saveHistory = byId('save-history');
    if (saveHistory) saveHistory.checked = settings.saveHistory !== false;
  }

  function saveSettings() {
    const settings = {
      // Appearance
      theme: byId('theme-select')?.value || 'light',
      fontSize: byId('font-size-select')?.value || 'medium',
      
      // Chat behavior
      enterToSend: byId('enter-to-send')?.checked !== false,
      autoScroll: byId('auto-scroll')?.checked !== false,
      showTimestamps: byId('show-timestamps')?.checked !== false,
      
      // AI settings
      defaultModel: byId('default-model-select')?.value || 'gemma3:270m',
      maxTokens: parseInt(byId('max-tokens')?.value) || 1000,
      
      // Privacy
      saveHistory: byId('save-history')?.checked !== false,
    };
    
    // Update state
    state.settings = { ...state.settings, ...settings };
    
    // Save to localStorage
    localStorage.setItem(STORE.settings, JSON.stringify(state.settings));
    
    // Apply settings immediately
    applySettings(settings);
    
    toast('Settings saved successfully! 💾');
    closeSettingsModal();
  }

  function applySettings(settings) {
    // Apply theme
    if (settings.theme) {
      if (settings.theme === 'dark') {
        document.body.classList.add('dark-theme');
      } else {
        document.body.classList.remove('dark-theme');
      }
    }
    
    // Apply font size
    if (settings.fontSize) {
      document.body.style.fontSize = settings.fontSize === 'small' ? '14px' :
                                   settings.fontSize === 'large' ? '18px' : '16px';
    }
    
    // Update model selector if default model changed
    if (settings.defaultModel && el.modelSelect) {
      el.modelSelect.value = settings.defaultModel;
    }
    
    // Apply show timestamps setting
    updateTimestampVisibility(settings.showTimestamps !== false);
  }

  function updateTimestampVisibility(show) {
    const timestamps = document.querySelectorAll('.message-time');
    timestamps.forEach(ts => {
      ts.style.display = show ? 'block' : 'none';
    });
  }

  function updateSliderValue(slider) {
    const valueDisplay = slider.nextElementSibling;
    if (valueDisplay && valueDisplay.classList.contains('slider-value')) {
      valueDisplay.textContent = slider.value;
    }
  }

  function resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to default values? This cannot be undone.')) {
      return;
    }
    
    // Reset to defaults
    state.settings = {
      enterToSend: true,
      autoScroll: true,
      theme: "light",
      fontSize: "medium",
      showTimestamps: true,
      defaultModel: "gemma3:270m",
      maxTokens: 1000,
      saveHistory: true,
    };
    
    // Save to localStorage
    localStorage.setItem(STORE.settings, JSON.stringify(state.settings));
    
    // Apply defaults
    applySettings(state.settings);
    
    // Reload form
    loadSettingsToForm();
    
    toast('Settings reset to defaults! 🔄');
  }

  function clearCache() {
    if (!confirm('Are you sure you want to clear all cached data? This will remove conversation history and temporary data.')) {
      return;
    }
    
    // Clear conversation history
    localStorage.removeItem(STORE.chats);
    localStorage.removeItem(STORE.activeChat);
    localStorage.removeItem('mike-ai-feedback');
    
    // Clear current state
    state.chats = [];
    state.activeChatId = null;
    
    // Create new chat
    ensureActiveChat();
    renderActiveChat();
    renderChatList();
    
    toast('Cache cleared successfully! 🗑️');
  }

  // Heartbeat functionality
  let heartbeatInterval = null;
  let heartbeatElement = null;

  function startHeartbeat() {
    if (heartbeatInterval) return;
    
    // Create heartbeat element if it doesn't exist
    if (!heartbeatElement) {
      heartbeatElement = document.createElement('div');
      heartbeatElement.id = 'heartbeat-indicator';
      heartbeatElement.className = 'heartbeat-indicator';
      heartbeatElement.innerHTML = '❤️';
      document.body.appendChild(heartbeatElement);
    }
    
    // Show heartbeat
    heartbeatElement.style.display = 'block';
    
    // Start pulsing animation
    let pulseCount = 0;
    heartbeatInterval = setInterval(() => {
      heartbeatElement.style.transform = 'scale(1.2)';
      setTimeout(() => {
        heartbeatElement.style.transform = 'scale(1)';
      }, 200);
      pulseCount++;
      
      // Add extra pulse every 4 beats
      if (pulseCount % 4 === 0) {
        setTimeout(() => {
          heartbeatElement.style.transform = 'scale(1.3)';
          setTimeout(() => {
            heartbeatElement.style.transform = 'scale(1)';
          }, 150);
        }, 400);
      }
    }, 800);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    
    if (heartbeatElement) {
      heartbeatElement.style.display = 'none';
    }
  }
})();
