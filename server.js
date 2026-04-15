const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Import authentication system
const AuthSystem = require('./auth-system');
const authSystem = new AuthSystem();

// JWT Secret
const JWT_SECRET = 'mike-ai-super-secret-key-2026';

// Enhanced conversation memory for human-like interactions
const MEMORY_FILE = './conversation-memory.json';

let enhancedMemory = {
  conversations: [],
  dailyLog: {},        // By date: "2026-03-26"
  weeklyLog: {},        // By week: "week-12"
  monthlyLog: {},       // By month: "2026-03"
  userTopics: new Set(), // Track all topics
  personalContext: {      // Remember user details
    name: null,
    preferences: {},
    frequentlyAsked: [],
    communicationStyle: 'friendly',
    lastSeen: null,
    conversationStart: null
  },
  conversationThreads: [], // Track conversation threads
  emotionalContext: {},   // Track emotional tone
  projectContext: {},       // Remember ongoing projects
  timePatterns: {}        // User activity patterns
};

// Load existing memory from disk
function loadEnhancedMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, 'utf8');
      const loaded = JSON.parse(data);
      // Convert Set objects back to Sets
      if (loaded.userTopics && Array.isArray(loaded.userTopics)) {
        loaded.userTopics = new Set(loaded.userTopics);
      }
      // Merge with defaults
      enhancedMemory = { ...enhancedMemory, ...loaded };
      console.log('📚 Enhanced memory loaded from disk');
    } else {
      console.log('📝 Memory file not found, starting fresh');
    }
  } catch (error) {
    console.log('❌ Error loading memory:', error.message);
    console.log('📝 Starting with fresh memory');
  }
}

// Save memory to disk
function saveEnhancedMemory() {
  try {
    // Convert Set to Array for JSON serialization
    const memoryToSave = {
      ...enhancedMemory,
      userTopics: Array.from(enhancedMemory.userTopics)
    };
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryToSave, null, 2));
    console.log('💾 Enhanced memory saved to disk');
  } catch (error) {
    console.log('❌ Error saving memory:', error.message);
  }
}

// Get time-based context
function getTimeBasedContext() {
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const thisWeek = getWeekNumber(now);
  const lastWeek = getWeekNumber(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  
  return {
    now,
    today,
    yesterday,
    thisWeek,
    lastWeek,
    hour: now.getHours(),
    dayOfWeek: now.getDay(),
    timeOfDay: getTimeOfDay(now.getHours())
  };
}

// Get week number
function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Get time of day
function getTimeOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// Analyze user patterns
function analyzeUserPatterns() {
  const recentConversations = enhancedMemory.conversations.slice(-10);
  const patterns = {
    activeHours: [],
    preferredTopics: {},
    averageResponseLength: 0,
    emotionalTone: 'neutral'
  };
  
  recentConversations.forEach(conv => {
    if (conv.timestamp) {
      const hour = new Date(conv.timestamp).getHours();
      patterns.activeHours.push(hour);
    }
    
    if (conv.topics) {
      conv.topics.forEach(topic => {
        patterns.preferredTopics[topic] = (patterns.preferredTopics[topic] || 0) + 1;
      });
    }
  });
  
  return patterns;
}

// Get conversation context
function getConversationContext() {
  const timeContext = getTimeBasedContext();
  const userPatterns = analyzeUserPatterns();
  const recentTopics = Array.from(enhancedMemory.userTopics).slice(-5);
  
  return {
    timeContext,
    userPatterns,
    recentTopics,
    personalContext: enhancedMemory.personalContext,
    ongoingConversations: enhancedMemory.conversationThreads.filter(t => t.active),
    daysSinceLastConversation: enhancedMemory.personalContext.lastSeen ? 
      Math.floor((timeContext.now - new Date(enhancedMemory.personalContext.lastSeen)) / (24 * 60 * 60 * 1000)) : null
  };
}

// Enhanced human-like response generator
function generateHumanLikeResponse(message, context) {
  const timeContext = context.timeContext;
  const messageLower = message.toLowerCase();
  
  // Time-based greetings
  if (messageLower.includes('good morning') || messageLower.includes('morning')) {
    if (context.daysSinceLastConversation && context.daysSinceLastConversation < 2) {
      const yesterdayTopics = enhancedMemory.dailyLog[timeContext.yesterday] || [];
      const lastTopic = yesterdayTopics[yesterdayTopics.length - 1]?.topic || 'our conversation';
      return `Good morning! Great to see you again. Yesterday we were discussing ${lastTopic}. How has your morning been so far?`;
    }
    return `Good morning! ${context.personalContext.name || 'there'}. What would you like to work on today?`;
  }
  
  if (messageLower.includes('good afternoon') || messageLower.includes('afternoon')) {
    return `Good afternoon! ${context.personalContext.name || 'there'}. How's your day going?`;
  }
  
  if (messageLower.includes('good evening') || messageLower.includes('evening')) {
    return `Good evening! ${context.personalContext.name || 'there'}. Ready to help with whatever you need tonight.`;
  }
  
  // Memory-based responses
  if (messageLower.includes('remember') || messageLower.includes('recall')) {
    const recentTopics = context.recentTopics.slice(-3);
    if (recentTopics.length > 0) {
      return `Yes! I remember our recent conversations about: ${recentTopics.join(', ')}. What would you like to continue with?`;
    }
  }
  
  // Follow-up responses
  if (messageLower.includes('follow up') || messageLower.includes('continue')) {
    const lastConversation = enhancedMemory.conversations[enhancedMemory.conversations.length - 1];
    if (lastConversation) {
      return `I'd be happy to continue our discussion about ${lastConversation.topics?.join(', ') || 'our previous topic'}. Where were we?`;
    }
  }
  
  // Project context responses
  if (messageLower.includes('project') || messageLower.includes('work')) {
    const currentProject = enhancedMemory.projectContext.current;
    if (currentProject) {
      const daysAgo = Math.floor((timeContext.now - new Date(currentProject.startDate)) / (24 * 60 * 60 * 1000));
      return `About your ${currentProject.name} project - we started this ${daysAgo} days ago. How is progress coming along?`;
    }
  }
  
  // Natural conversation flow
  return generateContextualResponse(message, context);
}

// Generate contextual response based on conversation history and patterns
function generateContextualResponse(message, context) {
  const messageLower = message.toLowerCase();
  const recentConversations = context.recentConversations || [];
  const userPatterns = context.userPatterns || {};
  const timeContext = context.timeContext;
  
  // Check for follow-up questions
  if (messageLower.includes('what about') || messageLower.includes('how about') || messageLower.includes('and')) {
    const lastTopic = recentConversations[recentConversations.length - 1]?.topics?.[0];
    if (lastTopic) {
      return `Regarding ${lastTopic}, let me elaborate on that. Based on our previous discussion, I can provide more details or explore different aspects. What specific angle would you like me to focus on?`;
    }
  }
  
  // Check for clarification requests
  if (messageLower.includes('explain more') || messageLower.includes('clarify') || messageLower.includes('what do you mean')) {
    return `I'd be happy to clarify! Could you let me know which part of my previous response you'd like me to explain in more detail? I want to make sure I address exactly what you're curious about.`;
  }
  
  // Check for opinion or preference requests
  if (messageLower.includes('what do you think') || messageLower.includes('your opinion') || messageLower.includes('recommend')) {
    return `That's a great question! Based on our conversations and your interests in ${context.recentTopics.join(', ') || 'various topics'}, I can share my perspective. What specific aspect would you like my thoughts on?`;
  }
  
  // Check for continuation requests
  if (messageLower.includes('continue') || messageLower.includes('go on') || messageLower.includes('tell me more')) {
    const lastResponse = recentConversations[recentConversations.length - 1]?.response;
    if (lastResponse) {
      return `I'd be happy to continue! We were discussing ${context.recentTopics[context.recentTopics.length - 1] || 'our previous topic'}. Let me expand on what I was saying and provide additional insights...`;
    }
  }
  
  // Check for greetings and provide memory-aware responses
  if (messageLower.includes('hello') || messageLower.includes('hi') || messageLower.includes('hey')) {
    if (context.totalInteractions > 0) {
      const hoursSinceLast = context.daysSinceLastConversation * 24 || 0;
      if (hoursSinceLast < 1) {
        return `Hello again! We were just talking a moment ago. I remember our conversation about ${context.recentTopics[context.recentTopics.length - 1] || 'various topics'}. How can I help you continue?`;
      } else if (context.daysSinceLastConversation && context.daysSinceLastConversation > 1) {
        return `Hello! It's been ${context.daysSinceLastConversation} days since we last talked. I remember we discussed ${context.recentTopics[context.recentTopics.length - 1] || 'various topics'}. What would you like to work on today?`;
      } else {
        return `Hello! Great to see you again. I remember our recent conversations about ${context.recentTopics.slice(-3).join(', ') || 'various topics'}. What's on your mind today?`;
      }
    } else {
      return `Hello! I'm here to help and I'll remember our conversations. What would you like to discuss?`;
    }
  }
  
  // Time-aware contextual responses
  if (timeContext.timeOfDay === 'morning' && !messageLower.includes('morning')) {
    if (context.totalInteractions > 0) {
      return `Good morning! ${context.personalContext.name || 'there'}. Ready to continue our discussions? Last time we talked about ${context.recentTopics[context.recentTopics.length - 1] || 'various topics'}.`;
    }
    return `Good morning! ${context.personalContext.name || 'there'}. I'm ready to help you with whatever you have in mind today. What would you like to work on?`;
  }
  
  if (timeContext.timeOfDay === 'evening' && !messageLower.includes('evening')) {
    if (context.totalInteractions > 0) {
      return `Good evening! How was your day? I remember our earlier conversations about ${context.recentTopics.slice(-2).join(', ') || 'various topics'}. What can I help you with tonight?`;
    }
    return `Good evening! How was your day? I'm here to help you with anything you need tonight.`;
  }
  
  // Pattern-based responses
  if (userPatterns.preferredTopics && Object.keys(userPatterns.preferredTopics).length > 0) {
    const topTopic = Object.entries(userPatterns.preferredTopics)
      .sort(([,a], [,b]) => b - a)[0][0];
    
    if (messageLower.includes(topTopic)) {
      return `I see you're interested in ${topTopic} again! You've mentioned this topic several times. Let me provide you with some fresh insights on ${topTopic}...`;
    }
  }
  
  // Memory-aware responses for returning users
  if (context.totalInteractions > 0) {
    if (context.daysSinceLastConversation && context.daysSinceLastConversation > 1) {
      return `It's great to hear from you again! It's been ${context.daysSinceLastConversation} days since we last talked. Last time we discussed ${context.recentTopics[context.recentTopics.length - 1] || 'various topics'}. What's new on your mind?`;
    } else {
      return `I remember our conversations! We've talked about ${context.recentTopics.slice(-3).join(', ') || 'various topics'} recently (${context.totalInteractions} total interactions). How can I help you today?`;
    }
  }
  
  // Default contextual response for new users
  return `Hello! I'm here to help and I'll remember our conversations going forward. What would you like to discuss today?`;
}

// Update enhanced memory
function updateEnhancedMemory(message, model, response) {
  const now = new Date().toISOString();
  const timeContext = getTimeBasedContext();
  
  // Analyze message for topics
  const topics = extractTopics(message);
  topics.forEach(topic => enhancedMemory.userTopics.add(topic));
  
  // Generate thread ID and update threads
  const threadId = generateThreadId(message);
  updateConversationThreads(message, topics, threadId);
  
  // Update user preferences
  updateUserPreferences(message, response);
  
  // Create conversation entry
  const conversation = {
    timestamp: now,
    message,
    response,
    model,
    topics,
    timeOfDay: timeContext.timeOfDay,
    dayOfWeek: timeContext.dayOfWeek,
    emotionalTone: analyzeEmotionalTone(message),
    threadId: threadId,
    relevantMemories: getRelevantMemories(message, topics)
  };
  
  // Update memory
  enhancedMemory.conversations.push(conversation);
  
  // Update daily log
  if (!enhancedMemory.dailyLog[timeContext.today]) {
    enhancedMemory.dailyLog[timeContext.today] = [];
  }
  enhancedMemory.dailyLog[timeContext.today].push(conversation);
  
  // Update weekly and monthly logs
  const weekKey = `week-${getWeekNumber(new Date())}`;
  const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  
  if (!enhancedMemory.weeklyLog[weekKey]) {
    enhancedMemory.weeklyLog[weekKey] = [];
  }
  enhancedMemory.weeklyLog[weekKey].push(conversation);
  
  if (!enhancedMemory.monthlyLog[monthKey]) {
    enhancedMemory.monthlyLog[monthKey] = [];
  }
  enhancedMemory.monthlyLog[monthKey].push(conversation);
  
  // Update personal context
  enhancedMemory.personalContext.lastSeen = now;
  if (!enhancedMemory.personalContext.conversationStart) {
    enhancedMemory.personalContext.conversationStart = now;
  }
  
  // Update project context
  updateProjectContext(message, topics);
  
  // Update emotional context
  const emotion = analyzeEmotionalTone(message);
  if (!enhancedMemory.emotionalContext[timeContext.today]) {
    enhancedMemory.emotionalContext[timeContext.today] = [];
  }
  enhancedMemory.emotionalContext[timeContext.today].push(emotion);
  
  // Update time patterns
  if (!enhancedMemory.timePatterns[timeContext.hour]) {
    enhancedMemory.timePatterns[timeContext.hour] = 0;
  }
  enhancedMemory.timePatterns[timeContext.hour]++;
  
  // Keep memory size manageable
  if (enhancedMemory.conversations.length > 100) {
    enhancedMemory.conversations = enhancedMemory.conversations.slice(-50);
  }
  
  // Save to disk
  saveEnhancedMemory();
  
  console.log(`Enhanced memory updated: ${enhancedMemory.conversations.length} total conversations`);
}

// Extract topics from message with enhanced analysis
function extractTopics(message) {
  const topicKeywords = [
    'project', 'work', 'code', 'programming', 'help', 'learn', 'study',
    'business', 'personal', 'family', 'health', 'travel', 'technology',
    'science', 'history', 'culture', 'language', 'food', 'sports',
    'music', 'art', 'design', 'writing', 'research', 'development',
    'database', 'web', 'mobile', 'ai', 'machine learning', 'data',
    'security', 'network', 'server', 'frontend', 'backend',
    'education', 'school', 'university', 'course', 'tutorial',
    'game', 'gaming', 'entertainment', 'movie', 'book', 'story',
    'facebook', 'robotics', 'image', 'analysis', 'conversation', 'memory'
  ];
  
  const topics = [];
  const words = message.toLowerCase().split(/\s+/);
  const messageLower = message.toLowerCase();
  
  // Check single words and partial matches
  words.forEach(word => {
    topicKeywords.forEach(keyword => {
      if (word.includes(keyword) || keyword.includes(word)) {
        topics.push(keyword);
      }
    });
  });
  
  // Check for specific patterns
  if (messageLower.includes('what did we talk about') || messageLower.includes('what have we discussed')) {
    topics.push('conversation-history');
  }
  
  if (messageLower.includes('hello') || messageLower.includes('hi') || messageLower.includes('hey')) {
    topics.push('greeting');
  }
  
  if (messageLower.includes('facebook') || messageLower.includes('social media')) {
    topics.push('social-media');
  }
  
  if (messageLower.includes('robotics') || messageLower.includes('robot')) {
    topics.push('robotics');
  }
  
  if (messageLower.includes('image') || messageLower.includes('picture') || messageLower.includes('photo')) {
    topics.push('image-analysis');
  }
  
  // Extract named entities (simple version)
  const entities = message.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  entities.forEach(entity => {
    if (entity.length > 2 && !topicKeywords.includes(entity.toLowerCase())) {
      topics.push(entity);
    }
  });
  
  // Ensure we always have at least one topic for conversation tracking
  if (topics.length === 0) {
    topics.push('general');
  }
  
  return [...new Set(topics)];
}

// Analyze emotional tone
function analyzeEmotionalTone(message) {
  const positiveWords = ['great', 'awesome', 'good', 'happy', 'excited', 'love', 'wonderful'];
  const negativeWords = ['bad', 'sad', 'angry', 'frustrated', 'hate', 'terrible'];
  const questionWords = ['?', 'how', 'what', 'why', 'when', 'where'];
  
  const messageLower = message.toLowerCase();
  let score = 0;
  
  positiveWords.forEach(word => {
    if (messageLower.includes(word)) score += 1;
  });
  
  negativeWords.forEach(word => {
    if (messageLower.includes(word)) score -= 1;
  });
  
  if (messageLower.includes('?')) score += 0.5;
  
  if (score > 1) return 'positive';
  if (score < -1) return 'negative';
  return 'neutral';
}

// Generate thread ID for conversation tracking
function generateThreadId(message) {
  const topics = extractTopics(message);
  return topics.length > 0 ? topics[0] : 'general';
}

// Update project context
function updateProjectContext(message, topics) {
  if (topics.includes('project') || topics.includes('work')) {
    enhancedMemory.projectContext.current = {
      name: 'Current Project',
      startDate: new Date().toISOString(),
      status: 'active'
    };
  }
}

// Track conversation threads for better context
function updateConversationThreads(message, topics, threadId) {
  const existingThread = enhancedMemory.conversationThreads.find(t => t.id === threadId);
  
  if (existingThread) {
    existingThread.messages.push({
      content: message,
      topics: topics,
      timestamp: new Date().toISOString()
    });
    existingThread.lastUpdated = new Date().toISOString();
    existingThread.active = true;
  } else {
    enhancedMemory.conversationThreads.push({
      id: threadId,
      topics: topics,
      messages: [{
        content: message,
        topics: topics,
        timestamp: new Date().toISOString()
      }],
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      active: true
    });
  }
  
  // Clean up old inactive threads
  enhancedMemory.conversationThreads = enhancedMemory.conversationThreads.filter(t => 
    t.active || (Date.now() - new Date(t.lastUpdated) < 7 * 24 * 60 * 60 * 1000)
  );
}

// Get relevant memories for current conversation
function getRelevantMemories(message, topics) {
  const relevantMemories = {
    recentConversations: [],
    relatedTopics: [],
    similarQuestions: [],
    userPatterns: {}
  };
  
  // Get recent conversations with similar topics
  relevantMemories.recentConversations = enhancedMemory.conversations
    .filter(conv => conv.topics && conv.topics.some(topic => topics.includes(topic)))
    .slice(-5);
  
  // Get related topics from history
  const allTopics = enhancedMemory.conversations.flatMap(conv => conv.topics || []);
  relevantMemories.relatedTopics = [...new Set(allTopics.filter(topic => 
    topics.some(t => topic.toLowerCase().includes(t.toLowerCase()) || 
                   t.toLowerCase().includes(topic.toLowerCase()))
  ))].slice(-10);
  
  // Get similar questions
  const messageLower = message.toLowerCase();
  relevantMemories.similarQuestions = enhancedMemory.conversations
    .filter(conv => conv.message && (
      conv.message.toLowerCase().includes(messageLower.substring(0, 20)) ||
      messageLower.includes(conv.message.toLowerCase().substring(0, 20))
    ))
    .slice(-3);
  
  // Get user patterns
  relevantMemories.userPatterns = analyzeUserPatterns();
  
  return relevantMemories;
}

// Remember user preferences and communication style
function updateUserPreferences(message, response) {
  const messageLower = message.toLowerCase();
  
  // Detect communication style preferences
  if (messageLower.includes('explain simply') || messageLower.includes('easy to understand')) {
    enhancedMemory.personalContext.communicationStyle = 'simple';
  } else if (messageLower.includes('detailed') || messageLower.includes('in depth')) {
    enhancedMemory.personalContext.communicationStyle = 'detailed';
  } else if (messageLower.includes('quick') || messageLower.includes('brief')) {
    enhancedMemory.personalContext.communicationStyle = 'concise';
  }
  
  // Detect frequently asked questions
  const questionPattern = messageLower.match(/\b(what|how|why|when|where|who)\b/);
  if (questionPattern) {
    enhancedMemory.personalContext.frequentlyAsked.push({
      question: message,
      timestamp: new Date().toISOString()
    });
    enhancedMemory.personalContext.frequentlyAsked = 
      enhancedMemory.personalContext.frequentlyAsked.slice(-20);
  }
  
  // Update name if user introduces themselves
  const nameMatch = message.match(/(?:my name is|i'm|i am)\s+([A-Z][a-z]+)/i);
  if (nameMatch && !enhancedMemory.personalContext.name) {
    enhancedMemory.personalContext.name = nameMatch[1];
  }
}

// Enhance cloud responses with human-like memory references
function enhanceCloudResponse(aiResponse, message, context) {
  const messageLower = message.toLowerCase();
  const timeContext = context.timeContext;
  
  // Always add memory context for returning users
  if (context.totalInteractions > 1) {
    // Check for greetings first
    if (messageLower.includes('hello') || messageLower.includes('hi') || messageLower.includes('hey')) {
      if (context.daysSinceLastConversation && context.daysSinceLastConversation > 1) {
        return `Hello again! It's been ${context.daysSinceLastConversation} days since we last talked. I remember we discussed ${context.recentTopics[context.recentTopics.length - 1] || 'various topics'}.\n\n${aiResponse}`;
      } else {
        return `Hello! Great to see you again. I remember our recent conversations about ${context.recentTopics.slice(-3).join(', ') || 'various topics'}.\n\n${aiResponse}`;
      }
    }
    
    // Time-aware enhancements
    if (messageLower.includes('good morning') || messageLower.includes('morning')) {
      if (context.daysSinceLastConversation && context.daysSinceLastConversation < 2) {
        const yesterdayTopics = enhancedMemory.dailyLog[timeContext.yesterday] || [];
        const lastTopic = yesterdayTopics[yesterdayTopics.length - 1]?.topics?.[0] || 'our conversation';
        return `Good morning! Great to see you again. Yesterday we were discussing ${lastTopic}. How has your morning been so far?\n\n${aiResponse}`;
      }
      return `Good morning! ${context.personalContext.name || 'there'}. I remember our conversations about ${context.recentTopics.slice(-2).join(', ') || 'various topics'}. What would you like to work on today?\n\n${aiResponse}`;
    }
    
    if (messageLower.includes('good afternoon') || messageLower.includes('afternoon')) {
      return `Good afternoon! ${context.personalContext.name || 'there'}. I remember our earlier discussions about ${context.recentTopics.slice(-2).join(', ') || 'various topics'}. How's your day going?\n\n${aiResponse}`;
    }
    
    if (messageLower.includes('good evening') || messageLower.includes('evening')) {
      return `Good evening! ${context.personalContext.name || 'there'}. I recall our conversations about ${context.recentTopics.slice(-2).join(', ') || 'various topics'} from today. Ready to help with whatever you need tonight.\n\n${aiResponse}`;
    }
    
    // Memory-based enhancements
    if (messageLower.includes('remember') || messageLower.includes('recall')) {
      const recentTopics = context.recentTopics.slice(-3);
      if (recentTopics.length > 0) {
        return `Yes! I remember our recent conversations about: ${recentTopics.join(', ')}. What would you like to continue with?\n\n${aiResponse}`;
      }
    }
    
    if (messageLower.includes('what we have talked about') || messageLower.includes('what we discussed') || messageLower.includes('what have we talked about')) {
      const todayTopics = enhancedMemory.dailyLog[timeContext.today] || [];
      const recentConversations = enhancedMemory.conversations.slice(-5);
      
      if (todayTopics.length > 0) {
        const todayTopicList = [...new Set(todayTopics.flatMap(t => t.topics || []))];
        return `Today we've discussed: ${todayTopicList.join(', ')}. ${recentConversations.length > 1 ? 'Earlier you asked about ' + recentConversations[0].topics?.join(', ') + ' and now you want to know what we talked about.' : ''}\n\n${aiResponse}`;
      }
      
      if (recentConversations.length > 0) {
        const recentTopicList = [...new Set(recentConversations.flatMap(c => c.topics || []))];
        return `In our recent conversations, we've discussed: ${recentTopicList.join(', ')}. I remember ${context.totalInteractions} total interactions with you.\n\n${aiResponse}`;
      }
      
      return `I remember ${context.totalInteractions} conversations with you. Let me check what we've been discussing...\n\n${aiResponse}`;
    }
    
    // Follow-up enhancements
    if (messageLower.includes('follow up') || messageLower.includes('continue')) {
      const lastConversation = enhancedMemory.conversations[enhancedMemory.conversations.length - 1];
      if (lastConversation) {
        return `I'd be happy to continue our discussion about ${lastConversation.topics?.join(', ') || 'our previous topic'}. Where were we?\n\n${aiResponse}`;
      }
    }
    
    // Project context enhancements
    if (messageLower.includes('project') || messageLower.includes('work')) {
      const currentProject = enhancedMemory.projectContext.current;
      if (currentProject) {
        const daysAgo = Math.floor((timeContext.now - new Date(currentProject.startDate)) / (24 * 60 * 60 * 1000));
        return `About your ${currentProject.name} project - we started this ${daysAgo} days ago. How is progress coming along?\n\n${aiResponse}`;
      }
    }
    
    // Add memory context to all responses for returning users
    const memoryPrefix = context.daysSinceLastConversation > 1 
      ? `Welcome back! I remember our previous conversations about ${context.recentTopics.slice(-2).join(', ') || 'various topics'}. `
      : `I remember our conversations about ${context.recentTopics.slice(-2).join(', ') || 'various topics'}. `;
    
    return `${memoryPrefix}\n\n${aiResponse}`;
  }
  
  // For new users, just return the AI response with a note about memory
  return `${aiResponse}\n\n*(I'll remember our conversations going forward!)*`;
}

// Initialize enhanced memory on startup
loadEnhancedMemory();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const verification = authSystem.verifyToken(token);
  if (!verification.success) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  req.user = verification;
  next();
}

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName, username } = req.body;
  
  const result = await authSystem.register({ email, password, firstName, lastName, username });
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  const result = await authSystem.login(email, password);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(401).json(result);
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// User routes
app.get('/api/user/profile', authenticateToken, (req, res) => {
  const result = authSystem.getUserById(req.user.userId);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(404).json(result);
  }
});

app.put('/api/user/profile', authenticateToken, (req, res) => {
  const result = authSystem.updateProfile(req.user.userId, req.body);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

app.get('/api/user/stats', authenticateToken, (req, res) => {
  const result = authSystem.getUserStats(req.user.userId);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(404).json(result);
  }
});

app.get('/api/user/conversations', authenticateToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const result = authSystem.getUserConversations(req.user.userId, limit);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

app.post('/api/user/conversations', authenticateToken, (req, res) => {
  const result = authSystem.saveConversation(req.user.userId, req.body);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// Configure axios for better reliability
const axiosConfig = {
    timeout: 120000, // 2 minutes timeout (reduced)
    maxContentLength: 50 * 1024 * 1024, // 50MB
    maxBodyLength: 50 * 1024 * 1024, // 50MB
    headers: {
        'User-Agent': 'Mike-AI-Chatbot/1.0',
        'Connection': 'keep-alive'
    }
};

// Ollama API endpoint
const OLLAMA_API = 'http://localhost:11434/api/generate'

// Memory management functions
function updateMemory(message, model, response) {
  // Update interaction count
  chatMemory.userPreferences.interactionCount++;
  chatMemory.userPreferences.lastUsedModel = model;
  
  // Add to conversation history
  chatMemory.conversations.push({
    timestamp: new Date(),
    message: message,
    response: response,
    model: model
  });
  
  // Keep only last 50 conversations to prevent memory bloat
  if (chatMemory.conversations.length > 50) {
    chatMemory.conversations = chatMemory.conversations.slice(-50);
  }
  
  // Analyze message for context
  const messageLower = message.toLowerCase();
  
  // Track topics
  if (messageLower.includes('code') || messageLower.includes('html') || messageLower.includes('javascript')) {
    chatMemory.context.codeRequests.push({
      timestamp: new Date(),
      request: message
    });
    chatMemory.context.codeRequests = chatMemory.context.codeRequests.slice(-10);
  }
  
  if (messageLower.includes('help') || messageLower.includes('how to')) {
    chatMemory.context.helpRequests.push({
      timestamp: new Date(),
      request: message
    });
    chatMemory.context.helpRequests = chatMemory.context.helpRequests.slice(-10);
  }
  
  // Track questions for context
  if (messageLower.includes('?') || messageLower.includes('what') || messageLower.includes('why')) {
    chatMemory.context.previousQuestions.push({
      timestamp: new Date(),
      question: message
    });
    chatMemory.context.previousQuestions = chatMemory.context.previousQuestions.slice(-20);
  }
  
  console.log(`Memory updated: ${chatMemory.conversations.length} conversations, ${chatMemory.userPreferences.interactionCount} interactions`);
}

function getMemoryContext() {
  // Force reload to ensure we have latest data
  loadEnhancedMemory();
  
  // Direct access to enhancedMemory without relying on getConversationContext
  const recentConvs = enhancedMemory.conversations ? enhancedMemory.conversations.slice(-5) : [];
  const allTopics = enhancedMemory.userTopics ? Array.from(enhancedMemory.userTopics) : [];
  const recentTopics = allTopics.slice(-10);
  
  console.log('DEBUG: enhancedMemory loaded:', !!enhancedMemory.conversations);
  console.log('DEBUG: enhancedMemory.conversations.length:', enhancedMemory.conversations?.length || 0);
  console.log('DEBUG: enhancedMemory.userTopics:', allTopics);
  console.log('DEBUG: recent conversations:', recentConvs.length);
  
  return {
    totalInteractions: enhancedMemory.conversations?.length || 0,
    recentConversations: recentConvs,
    recentTopics: recentTopics,
    recentCodeRequests: enhancedMemory.conversations?.filter(c => c.topics?.includes('code')).slice(-10) || [],
    recentHelpRequests: enhancedMemory.conversations?.filter(c => c.topics?.includes('help')).slice(-10) || [],
    previousQuestions: enhancedMemory.conversations?.filter(c => c.message.includes('?')).slice(-5) || [],
    timeContext: getTimeBasedContext(),
    userPatterns: analyzeUserPatterns(),
    personalContext: enhancedMemory.personalContext || {},
    projectContext: enhancedMemory.projectContext || {},
    conversationThreads: enhancedMemory.conversationThreads || [],
    dailyLog: enhancedMemory.dailyLog || {},
    weeklyLog: enhancedMemory.weeklyLog || {},
    memorySize: JSON.stringify(enhancedMemory).length
  };
}

// Memory endpoint
app.get('/api/memory', (req, res) => {
  const context = getMemoryContext();
  
  res.json({
    memory: context,
    enhancedFeatures: {
      timeBasedMemory: true,
      conversationThreads: true,
      personalContext: true,
      projectTracking: true,
      emotionalAnalysis: true,
      persistentStorage: true
    },
    statistics: {
      totalConversations: context.totalInteractions,
      todayConversations: context.dailyLog[context.timeContext.today]?.length || 0,
      thisWeekConversations: Object.values(context.dailyLog).flat().length,
      uniqueTopics: context.recentTopics.length,
      memorySize: context.memorySize,
      averageResponseTime: '1-3 seconds',
      lastInteraction: context.personalContext.lastSeen
    },
    userPatterns: {
      preferredTopics: context.userPatterns.preferredTopics,
      activeHours: context.userPatterns.activeHours,
      communicationStyle: context.personalContext.communicationStyle
    }
  });
});

// Clear memory endpoint
app.post('/api/memory/clear', (req, res) => {
  enhancedMemory = {
    conversations: [],
    dailyLog: {},
    weeklyLog: {},
    monthlyLog: {},
    userTopics: new Set(),
    personalContext: {
      name: null,
      preferences: {},
      frequentlyAsked: [],
      communicationStyle: 'friendly',
      lastSeen: null,
      conversationStart: null
    },
    conversationThreads: [],
    emotionalContext: {},
    projectContext: {},
    timePatterns: {}
  };
  
  saveEnhancedMemory();
  
  res.json({ 
    message: 'Enhanced memory cleared successfully',
    resetTime: new Date().toISOString(),
    memoryStats: {
      conversationsCleared: enhancedMemory.conversations.length,
      dailyLogCleared: Object.keys(enhancedMemory.dailyLog).length,
      topicsCleared: enhancedMemory.userTopics.size
    }
  });
});

// Intelligent response generator for Kimi K2.5 Cloud
function generateIntelligentResponse(message, memoryContext) {
  const messageLower = message.toLowerCase();
  
  // Person/celebrity questions
  if (messageLower.includes('who is') || messageLower.includes('ronaldo') || messageLower.includes('messi')) {
    if (messageLower.includes('ronaldo')) {
      return "Cristiano Ronaldo is a Portuguese professional footballer! ⚽ **Key Facts:**\n\n**🏆 Career Highlights:**\n• Full name: Cristiano Ronaldo dos Santos Aveiro\n• Born: February 5, 1985, Madeira, Portugal\n• Position: Forward\n• Current club: Al Nassr (Saudi Arabia)\n• Previous clubs: Sporting CP, Manchester United, Real Madrid, Juventus\n\n**🥅 Records & Achievements:**\n• 5 Ballon d'Or awards\n• Most international goals (men's football)\n• Champions League all-time top scorer\n• Over 800 career goals\n• UEFA Euro 2016 winner with Portugal\n\n**💪 Playing Style:**\n• Exceptional physical fitness and speed\n• Powerful shooting (free kicks, penalties)\n• Heading ability\n• Leadership and work ethic\n\n**🌟 Impact:**\n• One of the greatest footballers of all time\n• Global brand and social media influence\n• Philanthropic work and charity\n\nWhat specific aspect of Ronaldo would you like to know more about?";
    }
  }
  
  // Science questions
  if (messageLower.includes('what is') || messageLower.includes('explain')) {
    if (messageLower.includes('quantum')) {
      return "Quantum physics is fascinating! 🌌 **Quantum Mechanics Explained:**\n\n**🔬 Basic Concept:**\nQuantum mechanics describes how tiny particles (atoms, electrons, photons) behave at the smallest scales.\n\n**🎯 Key Principles:**\n• **Wave-Particle Duality**: Particles act like both waves and particles\n• **Superposition**: Particles can be in multiple states simultaneously\n• **Entanglement**: Connected particles affect each other instantly\n• **Uncertainty Principle**: Can't know position and momentum perfectly\n\n**💻 Applications:**\n• Quantum computers (super-fast processing)\n• Lasers and LEDs\n• MRI machines\n• Solar panels\n• GPS technology\n\n**🤯 Mind-Blowing Facts:**\n• Observing a quantum system changes it\n• Particles can \"teleport\" information\n• Time can flow differently at quantum scales\n\nWhat quantum concept interests you most?";
    }
  }
  
  // Technology questions
  if (messageLower.includes('how to') || messageLower.includes('code') || messageLower.includes('programming')) {
    return "I'd be happy to help with technology and coding! 💻 **Programming & Tech Help:**\n\n**🚀 What I can assist with:**\n• **Web Development**: HTML, CSS, JavaScript, React, Node.js\n• **Programming Languages**: Python, Java, C++, JavaScript\n• **Databases**: SQL, MongoDB, Firebase\n• **Tools & Frameworks**: Git, Docker, AWS, Firebase\n• **Problem Solving**: Debugging, algorithms, optimization\n\n**📝 How I can help:**\n• Code examples and explanations\n• Step-by-step tutorials\n• Debugging assistance\n• Best practices and tips\n• Project guidance\n\n**🎯 Just ask me:**\n• \"How to create a website\"\n• \"Explain JavaScript functions\"\n• \"Help me debug this code\"\n• \"What's the best way to learn Python?\"\n\nWhat specific tech topic would you like help with?";
  }
  
  // Language questions - Enhanced multi-language support
  if (messageLower.includes('kinyarwanda') || messageLower.includes('do you know') || messageLower.includes('language')) {
    if (messageLower.includes('kinyarwanda')) {
      return "Yes! I know Kinyarwanda! 🇷🇼 **About Kinyarwanda Language:**\n\n**🗣️ Language Overview:**\n• Kinyarwanda is the national language of Rwanda\n• Spoken by ~12 million people worldwide\n• Official language alongside English, French, Swahili\n• Part of the Bantu language family\n\n**📝 Basic Kinyarwanda Phrases:**\n• **Muraho** - Hello\n• **Amakuru** - How are you?\n• **Murakoze** - Thank you\n• **Mwaramutse** - Good morning\n• **Mwiriwe** - Good evening\n• **Umeze ute** - How are you doing? (This is what you asked!)\n\n**🎯 What I can help with:**\n• Basic translations\n• Cultural context\n• Language learning tips\n• Common phrases and greetings\n\n**💬 Your phrase \"umeze ute\" means:** \"How are you doing?\" - a friendly way to ask about someone's well-being!\n\nWould you like to learn more Kinyarwanda phrases or need help with translations?";
    }
    
    if (messageLower.includes('all language') || messageLower.includes('know all language')) {
      return "I can communicate in many languages! 🌍 **Multi-Language Capabilities:**\n\n**🗣️ Languages I Support:**\n\n**🇷🇼 African Languages:**\n• **Kinyarwanda** - Native Rwandan language\n• **Swahili** - East African trade language\n• **Zulu** - South African language\n• **Amharic** - Ethiopian official language\n\n**🇪🇺 European Languages:**\n• **English** - Global lingua franca\n• **French** - Romance language, Rwanda official\n• **Spanish** - Most spoken Romance language\n• **German** - Central European language\n• **Italian** - Mediterranean language\n• **Portuguese** - Brazil, Portugal, Africa\n• **Dutch** - Netherlands, Belgium\n\n**🇨🇳 Asian Languages:**\n• **Chinese (Mandarin)** - Most spoken language globally\n• **Japanese** - Island nation language\n• **Korean** - Korean Peninsula\n• **Hindi** - India's official language\n• **Arabic** - Middle East, North Africa\n• **Thai** - Southeast Asia\n• **Vietnamese** - Southeast Asia\n\n**🌏 Other Major Languages:**\n• **Russian** - Eastern Europe, Central Asia\n• **Portuguese** - Brazil, Angola, Mozambique\n• **Turkish** - Turkey, Cyprus\n• **Polish** - Eastern Europe\n\n**💬 Try These Examples:**\n• \"Hola cómo estás\" (Spanish)\n• \"Bonjour comment allez-vous\" (French)\n• \"Guten Tag wie geht es Ihnen\" (German)\n• \"Ciao come stai\" (Italian)\n• \"你好 你好吗\" (Chinese)\n• \"مرحبا كيف حالك\" (Arabic)\n\n**🎯 I Can Help With:**\n• Translations between languages\n• Cultural context and etiquette\n• Language learning tips\n• Regional dialects and variations\n• Business and travel phrases\n\nWhat language would you like to try? I'll respond naturally in that language!";
    }
  }
  
  // Multi-language direct responses
  if (messageLower.includes('hola') || messageLower.includes('cómo estás') || messageLower.includes('como estas')) {
    return "¡Hola! Estoy muy bien, gracias por preguntar. 😊 Como Kimi K2.5 Cloud, puedo ayudarte en español también. ¿En qué puedo asistirte hoy? Puedo ayudarte con:\n\n• Traducciones español-inglés\n• Ayuda con tareas escolares\n• Explicaciones en español\n• Conversación natural\n\n¿Qué te gustaría saber o en qué te puedo ayudar?";
  }
  
  if (messageLower.includes('bonjour') || messageLower.includes('comment allez') || messageLower.includes('ça va')) {
    return "Bonjour ! Je vais très bien, merci de demander. 😊 En tant que Kimi K2.5 Cloud, je peux aussi vous aider en français. Comment puis-je vous aider aujourd'hui ? Je peux vous aider avec :\n\n• Traductions français-anglais\n• Aide aux devoirs\n• Explications en français\n• Conversation naturelle\n\nQue puis-je faire pour vous ?";
  }
  
  if (messageLower.includes('guten tag') || messageLower.includes('wie geht') || messageLower.includes('hallo')) {
    return "Guten Tag! Mir geht es sehr gut, danke der Nachfrage. 😊 Als Kimi K2.5 Cloud kann ich Ihnen auch auf Deutsch helfen. Wie kann ich Ihnen heute behilflich sein? Ich kann Ihnen helfen mit:\n\n• Deutsch-Englisch Übersetzungen\n• Hausaufgabenhilfe\n• Erklärungen auf Deutsch\n• Natürliches Gespräch\n\nWie kann ich Ihnen helfen?";
  }
  
  if (messageLower.includes('ciao') || messageLower.includes('come stai') || messageLower.includes('buongiorno')) {
    return "Ciao! Sto molto bene, grazie per aver chiesto. 😊 Come Kimi K2.5 Cloud, posso aiutarti anche in italiano. Come posso aiutarti oggi? Posso aiutarti con:\n\n• Traduzioni italiano-inglese\n• Aiuto con i compiti\n• Spiegazioni in italiano\n• Conversazione naturale\n\nIn cosa posso aiutarti?";
  }
  
  if (messageLower.includes('你好') || messageLower.includes('你好吗') || messageLower.includes('您好')) {
    return "你好！我很好，谢谢你的问候。😊 作为Kimi K2.5 Cloud，我也可以用中文帮助你。今天我能为你做些什么？我可以帮助你：\n\n• 中英文翻译\n• 作业帮助\n• 中文解释\n• 自然对话\n\n你需要什么帮助？";
  }
  
  if (messageLower.includes('مرحبا') || messageLower.includes('كيف حالك') || messageLower.includes('اهلا')) {
    return "مرحبا! أنا بخير، شكراً لسؤالك. 😊 بصفتي Kimi K2.5 Cloud، يمكنني مساعدتك باللغة العربية أيضاً. كيف يمكنني مساعدتك اليوم؟ يمكنني مساعدتك في:\n\n• الترجمة العربية-إنجليزية\n• مساعدة الواجبات\n• شروحات باللغة العربية\n• محادثة طبيعية\n\nكيف يمكنني مساعدتك؟";
  }
  if (messageLower.includes('rwanda') && !messageLower.includes('kinyarwanda')) {
    return "I'll provide you with information about Rwanda! 🇷🇼 Here's a comprehensive summary:\n\n**🇷🇼 Republic of Rwanda**\n\n**🏛 Basic Information:**\n• Capital: Kigali\n• Population: ~13.9 million (2023)\n• Official Languages: Kinyarwanda, English, French, Swahili\n• Currency: Rwandan Franc (RWF)\n• Independence: July 1, 1962 (from Belgium)\n\n**🌍 Geography:**\n• Location: East Africa\n• Neighbors: Uganda, Tanzania, Burundi, DRC\n• Size: 26,338 km² (10,169 mi²)\n• Known as: \"Land of a Thousand Hills\"\n\n**💰 Economy:**\n• Major sectors: Agriculture, tourism, services, manufacturing\n• Key exports: Coffee, tea, minerals, tourism\n• Growing tech sector: Kigali Innovation City\n• Currency: RWF (1 USD ≈ 1,300 RWF)\n\n**🏛 Government:**\n• President: Paul Kagame (since 2000)\n• Type: Presidential Republic\n• Capital: Kigali\n• Member of: UN, African Union, Commonwealth\n\n**🌸 Culture:**\n• Traditional dance: Intore\n• National animal: Mountain Gorilla\n• Famous for: Imigongo (traditional baskets)\n• National sport: Football, basketball, volleyball\n\n**🚀 Recent Developments:**\n• Vision 2050: Become a middle-income country\n• Digital transformation initiatives\n• Conservation efforts for mountain gorillas\n• Growing tourism and hospitality sectors\n\n**💡 Interesting Facts:**\n• One of the safest countries in Africa\n• High literacy rate (~73%)\n• Plastic bags banned since 2019\n• Umuganda community service (monthly cleanup)\n\nThis summary covers Rwanda's key aspects! What specific information would you like to know more about?";
  }
  
  // General knowledge fallback with intelligence
  return `I understand you're asking about: "${message}" 🤔\n\nAs Kimi K2.5 Cloud, I can provide comprehensive information on many topics:\n\n**📚 Areas I excel in:**\n• 🏛️ History & Geography\n• 🔬 Science & Technology\n• ⚽ Sports & Entertainment\n• 🎨 Arts & Culture\n• 💼 Business & Economics\n• 🌍 Current Events\n• 💻 Programming & Tech\n\n**🎯 For best results, try:**\n• More specific questions\n• \"Tell me about [topic]\"\n• \"Explain [concept]\"\n• \"Who is [person]\"\n• \"What is [subject]\"\n\nI've processed ${memoryContext.totalInteractions || 1} conversations with you so far. Could you rephrase your question or be more specific about what you'd like to know?`;
}

// Search endpoint - Web search functionality
app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    console.log(`Searching for: ${query}`);

    const searchResult = await performWebSearch(query);
    if (!searchResult.success) {
      return res.status(502).json({
        error: 'Search failed',
        details: searchResult.error || 'Search provider unavailable'
      });
    }

    const payload = {
      ...searchResult.data,
      formattedResponse: formatSearchResponse(searchResult.data)
    };

    res.json(payload);

  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ 
      error: 'Search failed',
      details: error.message 
    });
  }
});

// Model-specific timeouts and optimizations
const modelConfigs = {
  'gemma3:270m': { timeout: 10000, priority: 'ultra-fast' },
  'gemma:2b': { timeout: 20000, priority: 'fast' },
  'llama3.2:1b': { timeout: 15000, priority: 'fast' },
  'llama3.2:3b': { timeout: 30000, priority: 'medium' },
  'qwen:0.5b': { timeout: 12000, priority: 'ultra-fast' },
  'mistral': { timeout: 25000, priority: 'medium' },
  'llama2': { timeout: 30000, priority: 'medium' },
  'deepseek-coder:6.7b': { timeout: 25000, priority: 'fast' },
  'deepseek-coder:33b': { timeout: 45000, priority: 'medium' },
  'deepseek:1.3b': { timeout: 20000, priority: 'fast' },
  'deepseek:7b': { timeout: 35000, priority: 'medium' },
  'kimi-k2.5:cloud': { timeout: 30000, priority: 'cloud-fast' },
  'qwen3-vl:235b-cloud': { timeout: 60000, priority: 'cloud-ultra' },
  'ministral-3:14b-cloud': { timeout: 45000, priority: 'cloud-ultra' },
  'gpt-oss:120b-cloud': { timeout: 45000, priority: 'cloud-ultra' }
};

// Get model configuration
function getModelConfig(model) {
    // Handle model name variations
    const cleanModel = model.replace(':latest', '');
    return modelConfigs[cleanModel] || modelConfigs['qwen:0.5b'];
}

function isVisionCapableModel(modelName = '') {
  const name = modelName.toLowerCase();
  const visionTokens = [
    'llava',
    'bakllava',
    'minicpm-v',
    'moondream',
    'qwen2.5vl',
    'qwen2-vl',
    'qwen-vl',
    'vision',
    '-vl'
  ];
  return visionTokens.some(token => name.includes(token));
}

async function resolveVisionModel(preferredModel) {
  // Keep selected model if it is already vision-capable.
  if (isVisionCapableModel(preferredModel)) {
    return { model: preferredModel, autoSelected: false };
  }

  try {
    const response = await axios.get('http://localhost:11434/api/tags', { timeout: 10000 });
    const models = Array.isArray(response.data?.models) ? response.data.models : [];
    const visionModel = models.find(entry => isVisionCapableModel(entry?.name || ''));
    if (visionModel?.name) {
      return { model: visionModel.name, autoSelected: true };
    }
  } catch (error) {
    // Fall through and return no vision model.
  }

  return { model: null, autoSelected: false };
}

function beginSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function sseData(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sseDone(res) {
  res.write('data: [DONE]\n\n');
  res.end();
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, model = 'gemma3:270m', conversationId, images = [] } = req.body;
    const wantsStream = Boolean(req.body && req.body.stream);
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const rawImages = Array.isArray(images) ? images.slice(0, 4) : [];
    const normalizedImages = rawImages
      .map(img => {
        if (typeof img === 'string') return img;
        if (img && typeof img === 'object' && typeof img.base64 === 'string') return img.base64;
        return '';
      })
      .filter(img => img.length > 0)
      .map(img => img.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''));
    const hasImages = normalizedImages.length > 0;
    let effectiveModel = model;

    if (hasImages) {
      const visionChoice = await resolveVisionModel(model);
      if (!visionChoice.model) {
        return res.status(400).json({
          error: 'No vision-capable model available for image analysis',
          details: 'Install a vision model in Ollama (example: llava) and try again.',
          suggestion: 'Run: ollama pull llava'
        });
      }
      effectiveModel = visionChoice.model;
    }
    
    console.log(`Processing message with model: ${effectiveModel}`);
    const modelConfig = getModelConfig(effectiveModel);
    
    // Check if user is authenticated
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let user = null;
    
    if (token) {
      const verification = authSystem.verifyToken(token);
      if (verification.success) {
        user = verification;
      }
    }
    
    // Get user-specific or guest memory
    let memoryContext;
    if (user) {
      // For authenticated users, use their profile and stats
      const userResult = authSystem.getUserById(user.userId);
      if (userResult.success) {
        memoryContext = {
          ...getMemoryContext(),
          user: userResult.user,
          isGuest: false
        };
      } else {
        memoryContext = { ...getMemoryContext(), isGuest: true };
      }
    } else {
      // For guest users, use shared memory
      memoryContext = { ...getMemoryContext(), isGuest: true };
    }
    
    console.log(`Chat request from ${user ? `user ${user.userId}` : 'guest'}: ${message}`);
    
    // Check for web search intent first
    if (!hasImages && shouldSearchWeb(message)) {
      try {
        const searchResults = await performWebSearch(message);
        if (searchResults.success) {
          const searchResponse = formatSearchResponse(searchResults.data);
          
          // Save conversation if user is authenticated
          if (user) {
            await authSystem.saveConversation(user.userId, {
              title: generateConversationTitle(message),
              messages: [{ role: 'user', content: message }, { role: 'assistant', content: searchResponse }],
              model: 'web-search',
              searchResults: searchResults.data
            });
          }
          
          if (wantsStream) {
            beginSSE(res);
            sseData(res, { delta: searchResponse, model: 'web-search' });
            sseDone(res);
            return;
          }

          return res.json({
            response: searchResponse,
            model: 'web-search',
            provider: 'DuckDuckGo',
            searchResults: searchResults.data,
            memoryContext: getMemoryContext(),
            isGuest: !user
          });
        }
      } catch (searchError) {
        console.log('Search failed, falling back to AI model');
      }
    }
    
    // Try to connect to Ollama first
    try {
      console.log(`Attempting API call with model: ${effectiveModel}`);
      console.log(`Model config: ${JSON.stringify(modelConfig)}`);
      
      // Handle cloud models - Connect to REAL Cloud Models
      if (effectiveModel.includes('cloud')) {
        console.log(`Connecting to REAL Cloud Model: ${effectiveModel}`);
        
        try {
          // Connect to actual cloud model through Ollama
          const response = await axios.post(OLLAMA_API, {
            model: effectiveModel,
            prompt: message,
            stream: wantsStream,
            ...(hasImages ? { images: normalizedImages } : {})
          }, {
            timeout: modelConfig.timeout,
            ...(wantsStream ? { responseType: 'stream' } : {}),
            ...axiosConfig
          });

          console.log(`✅ Real ${effectiveModel} response received`);
          if (wantsStream && response.data && typeof response.data.on === 'function') {
            beginSSE(res);
            let streamBuffer = '';
            response.data.on('data', chunk => {
              streamBuffer += chunk.toString();
              const lines = streamBuffer.split('\n');
              streamBuffer = lines.pop() || '';
              lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                try {
                  const parsed = JSON.parse(trimmed);
                  if (parsed.error) {
                    sseData(res, { error: parsed.error });
                    return;
                  }
                  if (parsed.response) sseData(res, { delta: parsed.response, model: effectiveModel });
                  if (parsed.done) sseDone(res);
                } catch (_) {}
              });
            });
            response.data.on('end', () => {
              if (!res.writableEnded) sseDone(res);
            });
            response.data.on('error', () => {
              if (!res.writableEnded) {
                sseData(res, { error: 'Streaming failed' });
                sseDone(res);
              }
            });
            return;
          }

          const aiResponse = response.data.response;
          
          // Apply human-like enhancement to cloud responses
          const context = getConversationContext();
          let enhancedResponse = enhanceCloudResponse(aiResponse, message, context);
          let fallbackSearchPayload = null;

          if (shouldAutoSearchFallback(enhancedResponse)) {
            const searchFallback = await buildSearchFallbackForChat(message, effectiveModel, enhancedResponse);
            enhancedResponse = searchFallback.response;
            if (searchFallback.used) {
              fallbackSearchPayload = searchFallback.searchResults;
            }
          }
          
          // Save conversation if user is authenticated
          if (user) {
            await authSystem.saveConversation(user.userId, {
              title: generateConversationTitle(message),
              messages: [{ role: 'user', content: message }, { role: 'assistant', content: enhancedResponse }],
              model: effectiveModel,
              provider: effectiveModel.includes('kimi') ? 'Kimi K2.5 Cloud (Real)' : 'GPT-OSS Cloud (Real)'
            });
          }
          
          // Update memory with this interaction
          updateEnhancedMemory(message, effectiveModel, enhancedResponse);
          
          res.json({
            response: enhancedResponse,
            model: effectiveModel,
            provider: effectiveModel.includes('kimi') ? 'Kimi K2.5 Cloud (Real)' : 'GPT-OSS Cloud (Real)',
            responseTime: effectiveModel.includes('gpt') ? 'cloud-ultra' : 'cloud-fast',
            priority: modelConfig.priority,
            cloudModel: true,
            memoryContext: getMemoryContext(),
            realCloud: true,
            enhancedFeatures: {
              timeAware: true,
              memoryReferences: true,
              personalContext: true,
              conversationFlow: true,
              autoWebFallback: true
            },
            imageAnalysis: rawImages.length > 0,
            fallbackSearch: fallbackSearchPayload,
            isGuest: !user
          });
          return;
          
        } catch (cloudError) {
          console.log(`Real ${effectiveModel} failed, using memory-aware fallback:`, cloudError.message);
          console.log('Cloud error details:', cloudError.response?.data);
          
          // Check if it's a connection issue or model issue
          if (cloudError.response?.status === 404) {
            // Use memory-aware response instead of error
            const context = getConversationContext();
            const memoryAwareResponse = generateHumanLikeResponse(message, context);
            
            updateEnhancedMemory(message, effectiveModel, memoryAwareResponse);
            
            if (user) {
              await authSystem.saveConversation(user.userId, {
                title: generateConversationTitle(message),
                messages: [{ role: 'user', content: message }, { role: 'assistant', content: memoryAwareResponse }],
                model: 'memory-fallback'
              });
            }
            
            return res.json({
              response: memoryAwareResponse,
              model: 'memory-fallback',
              priority: 'high',
              responseTime: 'instant',
              enhancedFeatures: {
                memoryAware: true,
                conversationContext: true,
                timeAware: true,
                personalContext: true
              },
              memoryContext: getMemoryContext(),
              fallbackReason: 'Cloud model unavailable',
              isGuest: !user
            });
          }

          if (hasImages) {
            return res.status(422).json({
              error: 'Image analysis failed on cloud vision model',
              details: cloudError.response?.data?.error || cloudError.message,
              suggestion: 'Try a local vision model like llava, or retry with another image.'
            });
          }
          
          // For other cloud errors, also use memory-aware fallback
          const context = getConversationContext();
          const memoryAwareResponse = generateHumanLikeResponse(message, context);
          
          updateEnhancedMemory(message, effectiveModel, memoryAwareResponse);
          
          if (user) {
            await authSystem.saveConversation(user.userId, {
              title: generateConversationTitle(message),
              messages: [{ role: 'user', content: message }, { role: 'assistant', content: memoryAwareResponse }],
              model: 'memory-fallback'
            });
          }
          
          return res.json({
            response: memoryAwareResponse,
            model: 'memory-fallback',
            priority: 'high',
            responseTime: 'instant',
            enhancedFeatures: {
              memoryAware: true,
              conversationContext: true,
              timeAware: true,
              personalContext: true
            },
            memoryContext: getMemoryContext(),
            fallbackReason: 'Cloud model connection failed',
            isGuest: !user
          });
        }
      }
      
      console.log(`API endpoint: ${OLLAMA_API}`);
      console.log(`Timeout set to: ${modelConfig.timeout}ms`);
      
      const response = await axios.post(OLLAMA_API, {
        model: effectiveModel,
        prompt: message,
        stream: wantsStream,
        ...(hasImages ? { images: normalizedImages } : {}),
        options: {
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 500 // Limit tokens for faster response
        }
      }, {
        timeout: modelConfig.timeout,
        ...(wantsStream ? { responseType: 'stream' } : {}),
        ...axiosConfig
      });

      console.log('Ollama response received successfully');
      if (wantsStream && response.data && typeof response.data.on === 'function') {
        beginSSE(res);
        let streamBuffer = '';
        response.data.on('data', chunk => {
          streamBuffer += chunk.toString();
          const lines = streamBuffer.split('\n');
          streamBuffer = lines.pop() || '';
          lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.error) {
                sseData(res, { error: parsed.error });
                return;
              }
              if (parsed.response) sseData(res, { delta: parsed.response, model: effectiveModel });
              if (parsed.done) sseDone(res);
            } catch (_) {}
          });
        });
        response.data.on('end', () => {
          if (!res.writableEnded) sseDone(res);
        });
        response.data.on('error', () => {
          if (!res.writableEnded) {
            sseData(res, { error: 'Streaming failed' });
            sseDone(res);
          }
        });
        return;
      }
      
      let finalResponse = response.data.response;
      let fallbackSearchPayload = null;

      // Always enhance responses with memory context for returning users
      const context = getConversationContext();
      const enhancedResponse = enhanceCloudResponse(finalResponse, message, context);
      finalResponse = enhancedResponse;

      if (shouldAutoSearchFallback(finalResponse)) {
        const searchFallback = await buildSearchFallbackForChat(message, effectiveModel, finalResponse);
        finalResponse = searchFallback.response;
        if (searchFallback.used) {
          fallbackSearchPayload = searchFallback.searchResults;
        }
      }

      // Save conversation if user is authenticated
      if (user) {
        await authSystem.saveConversation(user.userId, {
          title: generateConversationTitle(message),
          messages: [{ role: 'user', content: message }, { role: 'assistant', content: finalResponse }],
          model: effectiveModel
        });
      }
      
      // Update memory with this interaction
      updateEnhancedMemory(message, effectiveModel, finalResponse);
      
      res.json({
        response: finalResponse,
        model: effectiveModel,
        priority: modelConfig.priority,
        responseTime: 'fast',
        imageAnalysis: rawImages.length > 0,
        fallbackSearch: fallbackSearchPayload,
        enhancedFeatures: {
          autoWebFallback: true
        },
        memoryContext: getMemoryContext(),
        isGuest: !user
      });
    } catch (ollamaError) {
      console.log('Ollama API call failed:');
      console.error('Error details:', ollamaError.message);

      if (hasImages) {
        return res.status(422).json({
          error: 'Image analysis request failed',
          details: ollamaError.response?.data?.error || ollamaError.message,
          suggestion: 'Use a vision-capable model (for example: llava) and try again.'
        });
      }
      
      // Use memory-aware fallback response when models are unavailable
      const context = getConversationContext();
      const memoryAwareResponse = generateHumanLikeResponse(message, context);
      
      // Update memory with this interaction
      updateEnhancedMemory(message, effectiveModel, memoryAwareResponse);
      
      // Save conversation if user is authenticated
      if (user) {
        await authSystem.saveConversation(user.userId, {
          title: generateConversationTitle(message),
          messages: [{ role: 'user', content: message }, { role: 'assistant', content: memoryAwareResponse }],
          model: 'memory-fallback'
        });
      }
      
      console.log('Using memory-aware fallback response');
      
      res.json({
        response: memoryAwareResponse,
        model: 'memory-fallback',
        priority: 'high',
        responseTime: 'instant',
        imageAnalysis: false,
        enhancedFeatures: {
          memoryAware: true,
          conversationContext: true,
          timeAware: true,
          personalContext: true
        },
        memoryContext: getMemoryContext(),
        fallbackReason: 'AI model unavailable',
        isGuest: !user
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      error: 'Server error occurred',
      details: error.message 
    });
  }
});

// Web search functionality
function shouldSearchWeb(message) {
  const lowerMessage = (message || '').toLowerCase().trim();

  // Never force web-search for conversational/media intent.
  const nonSearchIntents = [
    'hello',
    'hi',
    'hey',
    'create image',
    'generate image',
    'analyse image',
    'analyze image',
    'image today',
    'can we',
    'please',
    'chat'
  ];
  if (nonSearchIntents.some(intent => lowerMessage.includes(intent))) {
    return false;
  }

  // Trigger web search only on explicit research-style prompts.
  const explicitSearchPrefixes = [
    'search ',
    'find ',
    'look up ',
    'web search ',
    'research ',
    'latest news',
    'current weather',
    'stock price'
  ];
  if (explicitSearchPrefixes.some(prefix => lowerMessage.startsWith(prefix))) {
    return true;
  }

  // Explicit question patterns that usually need external facts.
  const factualPatterns = [
    'what is ',
    'who is ',
    'when was ',
    'where is ',
    'latest ',
    'news about '
  ];
  return factualPatterns.some(pattern => lowerMessage.startsWith(pattern));
}

async function performWebSearch(query) {
  const providerCalls = [
    searchDuckDuckGoInstant(query),
    searchDuckDuckGoHtml(query),
    searchWikipedia(query)
  ];

  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID) {
    providerCalls.push(searchGoogleCSE(query));
  }

  const providers = await Promise.allSettled(providerCalls);

  const aggregated = {
    query,
    summary: '',
    sources: [],
    results: [],
    timestamp: new Date().toISOString()
  };

  providers.forEach(result => {
    if (result.status !== 'fulfilled' || !result.value) return;
    const providerData = result.value;
    if (providerData.source) aggregated.sources.push(providerData.source);
    if (!aggregated.summary && providerData.summary) aggregated.summary = providerData.summary;
    if (Array.isArray(providerData.results)) {
      aggregated.results.push(...providerData.results);
    }
  });

  // Deduplicate results by URL and cap list size.
  const seen = new Set();
  aggregated.results = aggregated.results.filter(item => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 8);

  // Generate a fallback summary from top snippets if needed.
  if (!aggregated.summary && aggregated.results.length > 0) {
    aggregated.summary = aggregated.results
      .slice(0, 2)
      .map(item => item.snippet || item.title)
      .filter(Boolean)
      .join(' ');
  }

  if (!aggregated.summary && aggregated.results.length === 0) {
    return {
      success: true,
      data: {
        query,
        summary: `I could not reach live web providers right now for "${query}". Please try again shortly, or rephrase your search.`,
        sources: ['Fallback'],
        results: [],
        timestamp: new Date().toISOString()
      }
    };
  }

  return { success: true, data: aggregated };
}

function formatSearchResponse(searchData) {
  const sources = (searchData.sources || []).join(', ') || 'Multiple sources';
  const intro = searchData.summary || `I found web results for "${searchData.query}".`;

  const lines = [
    `🔍 **Search Results for "${searchData.query}"**`,
    '',
    intro,
    '',
    `**Sources:** ${sources}`
  ];

  if (Array.isArray(searchData.results) && searchData.results.length) {
    lines.push('', '**Top Results:**');
    searchData.results.slice(0, 5).forEach((item, index) => {
      const title = item.title || `Result ${index + 1}`;
      const snippet = item.snippet ? ` - ${item.snippet}` : '';
      lines.push(`${index + 1}. [${title}](${item.url})${snippet}`);
    });
  }

  return lines.join('\n');
}

function shouldAutoSearchFallback(aiResponse) {
  const text = (aiResponse || '').toLowerCase();
  if (!text) return true;

  const uncertainPatterns = [
    "i don't know",
    'i do not know',
    'not sure',
    'cannot find',
    "can't find",
    'no information',
    'insufficient information',
    'unable to answer',
    'i am not certain',
    'i might be wrong',
    'unknown',
    'as an ai language model'
  ];

  return uncertainPatterns.some(pattern => text.includes(pattern));
}

async function buildSearchFallbackForChat(message, currentModel, currentResponse) {
  const searchResult = await performWebSearch(message);
  if (!searchResult.success || !searchResult.data) {
    return { used: false, response: currentResponse, model: currentModel };
  }

  const formatted = formatSearchResponse(searchResult.data);
  const mergedResponse = `${currentResponse}\n\n---\n\nI searched the web to get better information:\n\n${formatted}`;

  return {
    used: true,
    response: mergedResponse,
    searchResults: searchResult.data,
    model: `${currentModel}+web`
  };
}

async function searchDuckDuckGoInstant(query) {
  try {
    const response = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
      timeout: 12000
    });
    const data = response.data || {};
    const summary = data.AbstractText || data.Answer || '';
    const results = [];

    if (data.AbstractURL) {
      results.push({
        title: data.Heading || data.AbstractSource || 'DuckDuckGo Result',
        snippet: data.AbstractText || '',
        url: data.AbstractURL,
        source: 'DuckDuckGo'
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
      data.RelatedTopics.slice(0, 4).forEach(topic => {
        if (topic && topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Related Topic',
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'DuckDuckGo'
          });
        }
      });
    }

    return { source: 'DuckDuckGo Instant', summary, results };
  } catch (error) {
    return { source: 'DuckDuckGo Instant', summary: '', results: [] };
  }
}

async function searchDuckDuckGoHtml(query) {
  try {
    const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      timeout: 12000,
      headers: { 'User-Agent': 'Mike-AI-Chatbot/1.0' }
    });

    const html = response.data || '';
    const regex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const results = [];
    let match;

    while ((match = regex.exec(html)) !== null && results.length < 5) {
      let url = match[1];
      const title = decodeHtml(match[2].replace(/<[^>]+>/g, '').trim());

      const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
      if (uddgMatch && uddgMatch[1]) {
        url = decodeURIComponent(uddgMatch[1]);
      }

      if (url && title) {
        results.push({
          title,
          snippet: '',
          url,
          source: 'DuckDuckGo Web'
        });
      }
    }

    return { source: 'DuckDuckGo Web', summary: '', results };
  } catch (error) {
    return { source: 'DuckDuckGo Web', summary: '', results: [] };
  }
}

async function searchWikipedia(query) {
  try {
    const response = await axios.get(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json`, {
      timeout: 12000
    });
    const payload = response.data;
    if (!Array.isArray(payload) || payload.length < 4) {
      return { source: 'Wikipedia', summary: '', results: [] };
    }

    const titles = payload[1] || [];
    const snippets = payload[2] || [];
    const urls = payload[3] || [];

    const results = urls.map((url, index) => ({
      title: titles[index] || `Wikipedia ${index + 1}`,
      snippet: snippets[index] || '',
      url,
      source: 'Wikipedia'
    })).filter(item => item.url);

    const summary = results[0] ? (results[0].snippet || '') : '';
    return { source: 'Wikipedia', summary, results };
  } catch (error) {
    return { source: 'Wikipedia', summary: '', results: [] };
  }
}

async function searchGoogleCSE(query) {
  try {
    const key = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CSE_ID;
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&num=5`;
    const response = await axios.get(url, { timeout: 12000 });
    const items = Array.isArray(response.data?.items) ? response.data.items : [];

    const results = items.map(item => ({
      title: item.title || 'Google Result',
      snippet: item.snippet || '',
      url: item.link,
      source: 'Google'
    })).filter(item => item.url);

    const summary = results[0] ? (results[0].snippet || '') : '';
    return { source: 'Google CSE', summary, results };
  } catch (error) {
    return { source: 'Google CSE', summary: '', results: [] };
  }
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Generate conversation title from first message
function generateConversationTitle(message) {
  const words = message.split(' ').slice(0, 4);
  return words.join(' ') + (message.split(' ').length > 4 ? '...' : '');
}

// Get available models
app.get('/api/models', async (req, res) => {
  try {
    const response = await axios.get('http://localhost:11434/api/tags');
    
    // Filter out duplicate models and sort them
    const uniqueModels = [];
    const seenModels = new Set();
    
    response.data.models.forEach(model => {
      const modelName = model.name;
      
      // Skip duplicates - only keep one version of each model
      if (seenModels.has(modelName)) {
        return;
      }
      
      seenModels.add(modelName);
      uniqueModels.push(model);
    });
    
    res.json({ models: uniqueModels });
  } catch (error) {
    console.error('Error fetching models:', error.message);
    // Return demo models if Ollama is not available
    res.json({
      models: [
        { name: 'demo-mode', size: 0, modified: new Date().toISOString() }
      ]
    });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Chatbot server running on http://localhost:${PORT}`);
  console.log(`Share this link with others on your network: http://192.168.0.222:${PORT}`);
  console.log('Make sure Ollama is running on localhost:11434');
  console.log('Firewall may need to allow connections on port ' + PORT);
});
