import { Ref } from 'vue'
import axios from 'axios'

export default {
    updateImage: (url: string, ref: Ref<string>): void => {
        axios({
            method: 'get',
            url: url,
            responseType: 'blob',
        }).then(res => {
            ref.value = URL.createObjectURL(res.data)
        })
    },
}
