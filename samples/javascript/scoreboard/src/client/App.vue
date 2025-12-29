<template>
    <div class="container">
        <el-row :gutter="20">
            <el-col :span="24">
                <live-header class="live-header" />
            </el-col>
        </el-row>
        <el-row :gutter="40">
            <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
                <live-matches tabIndex="0"></live-matches>
                <div class="margin"></div>
                <past-matches tabIndex="0"></past-matches>
            </el-col>
            <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
                <match-details class="match-details" tabIndex="0"/>
            </el-col>
        </el-row>
    </div>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue'
import { useStore } from 'vuex'

import { ScoreSource } from './ScoreSource'

import LiveMatches from './components/LiveMatches.vue'
import PastMatches from './components/PastMatches.vue'
import MatchDetails from './components/MatchDetails.vue'
import LiveHeader from './components/LiveHeader.vue'

onMounted(() => {
    const store = useStore()
    const scoreSource = new ScoreSource(store.state.source.options.value)
    store.state.source.instance = scoreSource
})
</script>

<style lang="css">
html {
    font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
    background-color: rgb(241, 242, 246);
}
.live-header {
    height: 3vh;
    min-height: 50px;
    margin-bottom: 15px;
}
.match-details {
    height: 85vh;
}
.container {
    margin: 20px 30px 20px 30px;
}
.margin {
    margin-bottom: 1rem;
}
.horizontal-center {
    display: flex;
    align-items: center;
}
.vertical-center {
    display: flex;
    justify-content: center;
}
</style>
