'use client'

import { useCallback, useRef } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi: {
      load: (api: string, cb: () => void) => void
    }
    google: {
      picker: {
        PickerBuilder: new () => any
        DocsView: new (viewId: string) => any
        ViewId: { DOCS: string }
        Action: { PICKED: string; CANCEL: string }
        Feature: { NAV_HIDDEN: string }
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface PickerResult {
  action: string
  docs?: { id: string; name: string; mimeType: string }[]
}

const PICKER_SCRIPT = 'https://apis.google.com/js/api.js'
const GSI_SCRIPT = 'https://accounts.google.com/gsi/client'

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
}

function loadPicker(): Promise<void> {
  return new Promise((resolve) => {
    window.gapi.load('picker', resolve)
  })
}

export interface PickedFile {
  fileId: string
  fileName: string
}

export function useDrivePicker() {
  const readyRef = useRef(false)

  const open = useCallback(async (): Promise<PickedFile | null> => {
    await Promise.all([loadScript(PICKER_SCRIPT), loadScript(GSI_SCRIPT)])
    if (!readyRef.current) {
      await loadPicker()
      readyRef.current = true
    }

    const res = await fetch('/api/auth/google/token')
    if (!res.ok) throw new Error('Failed to get access token')
    const { accessToken } = await res.json() as { accessToken: string }

    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY
    if (!apiKey) throw new Error('Missing VITE_GOOGLE_API_KEY')

    return new Promise((resolve) => {
      const { picker } = window.google

      // PDF only, with folder navigation enabled
      const docsView = new picker.DocsView(picker.ViewId.DOCS)
      docsView.setMimeTypes('application/pdf')
      docsView.setIncludeFolders(true)
      docsView.setSelectFolderEnabled(false)

      new picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setTitle('PDF を選択')
        .setCallback((data: PickerResult) => {
          if (data.action === picker.Action.PICKED && data.docs?.[0]) {
            resolve({ fileId: data.docs[0].id, fileName: data.docs[0].name })
          } else if (data.action === picker.Action.CANCEL) {
            resolve(null)
          }
        })
        .build()
        .setVisible(true)
    })
  }, [])

  return { openPicker: open }
}
