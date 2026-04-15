const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Database file paths
const USERS_DB = './database/users.json';
const PROFILES_DB = './database/profiles.json';
const CONVERSATIONS_DB = './database/conversations.json';

// JWT Secret
const JWT_SECRET = 'mike-ai-super-secret-key-2026';

// Ensure database directory exists
function ensureDatabaseExists() {
  if (!fs.existsSync('./database')) {
    fs.mkdirSync('./database');
  }
  
  // Initialize database files if they don't exist
  if (!fs.existsSync(USERS_DB)) {
    fs.writeFileSync(USERS_DB, JSON.stringify({ users: [] }, null, 2));
  }
  
  if (!fs.existsSync(PROFILES_DB)) {
    fs.writeFileSync(PROFILES_DB, JSON.stringify({ profiles: [] }, null, 2));
  }
  
  if (!fs.existsSync(CONVERSATIONS_DB)) {
    fs.writeFileSync(CONVERSATIONS_DB, JSON.stringify({ conversations: [] }, null, 2));
  }
}

// User authentication functions
class AuthSystem {
  constructor() {
    ensureDatabaseExists();
  }

  // Register new user
  async register(userData) {
    const { email, password, firstName, lastName, username } = userData;
    
    try {
      // Load existing users
      const usersData = JSON.parse(fs.readFileSync(USERS_DB, 'utf8'));
      
      // Check if user already exists
      const existingUser = usersData.users.find(u => 
        u.email === email || u.username === username
      );
      
      if (existingUser) {
        return { success: false, error: 'User already exists' };
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create new user
      const newUser = {
        id: Date.now().toString(),
        email,
        username,
        firstName,
        lastName,
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        isActive: true,
        subscription: 'free',
        profile: {
          avatar: null,
          bio: '',
          preferences: {
            theme: 'light',
            language: 'english',
            defaultModel: 'gemma3:270m'
          }
        }
      };
      
      usersData.users.push(newUser);
      fs.writeFileSync(USERS_DB, JSON.stringify(usersData, null, 2));
      
      // Create user profile
      const profilesData = JSON.parse(fs.readFileSync(PROFILES_DB, 'utf8'));
      profilesData.profiles.push({
        userId: newUser.id,
        ...newUser.profile,
        stats: {
          totalConversations: 0,
          totalMessages: 0,
          favoriteTopics: [],
          activeDays: 0,
          joinDate: newUser.createdAt
        }
      });
      fs.writeFileSync(PROFILES_DB, JSON.stringify(profilesData, null, 2));
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: newUser.id, email: newUser.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      return {
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          subscription: newUser.subscription,
          profile: newUser.profile
        },
        token
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Login user
  async login(email, password) {
    try {
      const usersData = JSON.parse(fs.readFileSync(USERS_DB, 'utf8'));
      const user = usersData.users.find(u => u.email === email);
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (!isPasswordValid) {
        return { success: false, error: 'Invalid password' };
      }
      
      if (!user.isActive) {
        return { success: false, error: 'Account is deactivated' };
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          subscription: user.subscription,
          profile: user.profile
        },
        token
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Verify JWT token
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return { success: true, userId: decoded.userId, email: decoded.email };
    } catch (error) {
      return { success: false, error: 'Invalid token' };
    }
  }

  // Get user by ID
  getUserById(userId) {
    try {
      const usersData = JSON.parse(fs.readFileSync(USERS_DB, 'utf8'));
      const user = usersData.users.find(u => u.id === userId);
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      return { success: true, user: userWithoutPassword };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Update user profile
  updateProfile(userId, profileData) {
    try {
      const usersData = JSON.parse(fs.readFileSync(USERS_DB, 'utf8'));
      const userIndex = usersData.users.findIndex(u => u.id === userId);
      
      if (userIndex === -1) {
        return { success: false, error: 'User not found' };
      }
      
      // Update user profile
      usersData.users[userIndex].profile = {
        ...usersData.users[userIndex].profile,
        ...profileData
      };
      
      fs.writeFileSync(USERS_DB, JSON.stringify(usersData, null, 2));
      
      return { 
        success: true, 
        profile: usersData.users[userIndex].profile 
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Save conversation for user
  saveConversation(userId, conversation) {
    try {
      const conversationsData = JSON.parse(fs.readFileSync(CONVERSATIONS_DB, 'utf8'));
      
      const newConversation = {
        id: Date.now().toString(),
        userId,
        ...conversation,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      conversationsData.conversations.push(newConversation);
      fs.writeFileSync(CONVERSATIONS_DB, JSON.stringify(conversationsData, null, 2));
      
      // Update user stats
      const profilesData = JSON.parse(fs.readFileSync(PROFILES_DB, 'utf8'));
      const profileIndex = profilesData.profiles.findIndex(p => p.userId === userId);
      
      if (profileIndex !== -1) {
        profilesData.profiles[profileIndex].stats.totalConversations++;
        profilesData.profiles[profileIndex].stats.totalMessages += (conversation.messages?.length || 0);
        fs.writeFileSync(PROFILES_DB, JSON.stringify(profilesData, null, 2));
      }
      
      return { success: true, conversationId: newConversation.id };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get user conversations
  getUserConversations(userId, limit = 50) {
    try {
      const conversationsData = JSON.parse(fs.readFileSync(CONVERSATIONS_DB, 'utf8'));
      const userConversations = conversationsData.conversations
        .filter(c => c.userId === userId)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, limit);
      
      return { success: true, conversations: userConversations };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get user statistics
  getUserStats(userId) {
    try {
      const profilesData = JSON.parse(fs.readFileSync(PROFILES_DB, 'utf8'));
      const profile = profilesData.profiles.find(p => p.userId === userId);
      
      if (!profile) {
        return { success: false, error: 'Profile not found' };
      }
      
      return { success: true, stats: profile.stats };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = AuthSystem;
