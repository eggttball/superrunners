import { shallowReactive } from 'vue'
import { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth'
import { firebaseApp } from './firebase.js'

// This is a private single-user application. Create this account in Firebase Console.
export const ADMIN_EMAIL = 'eggttball@gmail.com'

export const auth = getAuth(firebaseApp)
export const authState = shallowReactive({ user: null, loading: true, error: '' })

setPersistence(auth, browserLocalPersistence).catch(error => {
  authState.error = error.message
})

onAuthStateChanged(auth, user => {
  authState.user = user
  authState.loading = false
})

const messages = {
  'auth/invalid-credential': 'Email 或密碼不正確。',
  'auth/invalid-email': '請輸入有效的 Email。',
  'auth/too-many-requests': '嘗試次數過多，請稍後再試。',
  'auth/network-request-failed': '網路連線失敗，請稍後再試。',
}

export async function signIn(password) {
  authState.error = ''
  try {
    await setPersistence(auth, browserLocalPersistence)
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password)
  } catch (error) {
    const message = messages[error.code] || '登入失敗，請確認帳號與密碼。'
    authState.error = message
    throw new Error(message)
  }
}

export async function signOut() {
  await firebaseSignOut(auth)
}
