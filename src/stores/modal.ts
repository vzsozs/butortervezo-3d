import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ModalAction {
  label: string
  value: any
  class?: string
  isCancel?: boolean
}

export const useModalStore = defineStore('modal', () => {
  const isOpen = ref(false)
  const title = ref('')
  const message = ref('')
  const actions = ref<ModalAction[]>([])

  // A felugró ablak "válasza" (Promise resolve)
  let resolvePromise: ((value: any) => void) | null = null

  function open(
    modalTitle: string,
    modalMessage: string,
    modalActions: ModalAction[] = [],
  ): Promise<any> {
    title.value = modalTitle
    message.value = modalMessage

    // Alapértelmezett gombok, ha nincs megadva semmi (pl. sima alert)
    if (modalActions.length === 0) {
      actions.value = [
        { label: 'Rendben', value: true, class: 'bg-blue-600 hover:bg-blue-500 text-white' },
      ]
    } else {
      actions.value = modalActions
    }

    isOpen.value = true

    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  function close(value: any = false) {
    isOpen.value = false
    if (resolvePromise) {
      resolvePromise(value)
      resolvePromise = null // Tiszta lap
    }
  }

  // --- Kényelmi metódusok ---

  async function confirm(msg: string, titleText = 'Megerősítés'): Promise<boolean> {
    return await open(titleText, msg, [
      { label: 'Rendben', value: true, class: 'bg-blue-600 hover:bg-blue-500 text-white' },
      {
        label: 'Mégse',
        value: false,
        class: 'bg-gray-700 hover:bg-gray-600 text-gray-200',
        isCancel: true,
      },
    ])
  }

  async function alert(msg: string, titleText = 'Információ'): Promise<void> {
    await open(titleText, msg)
  }

  return {
    isOpen,
    title,
    message,
    actions,
    open,
    close,
    confirm,
    alert,
  }
})
