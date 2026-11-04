import { toast } from 'sonner'

// One shared function, so the hook returns the same reference every render.
const confirm = (message: string) => toast.success(message)

/** Show a short confirmation, e.g. after saving a form. For warnings, import `toast` from 'sonner'. */
export const useToast = () => confirm
