import { initializeApp } from 'firebase/app'

export const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://superrunners-default-rtdb.asia-southeast1.firebasedatabase.app'
export const firebaseApp = initializeApp({
  apiKey: 'AIzaSyCJ5p1htMhprUyISvv9tE_gQNduXTlDdw4',
  authDomain: 'superrunners.firebaseapp.com',
  projectId: 'superrunners',
  storageBucket: 'superrunners.firebasestorage.app',
  messagingSenderId: '928153234245',
  appId: '1:928153234245:web:bd27a848ea352256feac2c',
  ...(databaseURL ? { databaseURL } : {}),
})
