import { $SYMBOL, SharedEnum } from '../shared.js'

export const hello = 'world'
export const A = SharedEnum.A

export const additional = () => {
    window.alert('additional')
}

export { $SYMBOL, SharedEnum }
