import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'

// Password hashing utilities
async function hashPassword(password) {
  return await bcrypt.hash(password, 12)
}

async function comparePassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword)
}

// Simple file-based user storage (you can replace with a database later)
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json')

// Ensure data directory exists
const dataDir = path.dirname(USERS_FILE)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]))
}

function getUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading users:', error)
    return []
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
    return true
  } catch (error) {
    console.error('Error saving users:', error)
    return false
  }
}

export async function getUserByEmail(email) {
  const users = getUsers()
  return users.find(user => user.email === email)
}

export async function createUser({ email, name, password, provider = 'credentials' }) {
  const users = getUsers()
  
  // Check if user already exists
  if (users.find(user => user.email === email)) {
    throw new Error('User already exists')
  }

  const newUser = {
    id: Date.now().toString(), // Simple ID generation
    email,
    name,
    provider,
    subscriptionStatus: 'free',
    createdAt: new Date().toISOString(),
    ...(provider === 'credentials' && password && {
      password: await hashPassword(password)
    })
  }

  users.push(newUser)
  saveUsers(users)
  
  return newUser
}

export async function verifyUser(email, password) {
  const user = await getUserByEmail(email)
  if (!user || user.provider !== 'credentials') {
    return null
  }

  const isValid = await comparePassword(password, user.password)
  if (!isValid) {
    return null
  }

  // Return user without password
  const { password: _, ...userWithoutPassword } = user
  return userWithoutPassword
}

export async function updateUserSubscription(email, subscriptionStatus) {
  const users = getUsers()
  const userIndex = users.findIndex(user => user.email === email)
  
  if (userIndex === -1) {
    return null
  }

  users[userIndex].subscriptionStatus = subscriptionStatus
  users[userIndex].subscriptionUpdatedAt = new Date().toISOString()
  
  saveUsers(users)
  return users[userIndex]
}
