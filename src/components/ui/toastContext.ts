import { toast } from 'sonner'

const confirm = (message: string) => toast.success(message)

/** Show a short confirmation, e.g. after saving a form. For warnings, import `toast` from 'sonner'. */
export const useToast = () => confirm
