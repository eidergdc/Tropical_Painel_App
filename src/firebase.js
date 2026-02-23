import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCRoGZQZD7k-18-BmLq7X4QMGJ5ODJwemc",
  authDomain: "iptv-black.firebaseapp.com",
  projectId: "iptv-black",
  storageBucket: "iptv-black.appspot.com",
  messagingSenderId: "427954135204",
  appId: "1:427954135204:web:6e7eb5aefef9fed6950631",
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
