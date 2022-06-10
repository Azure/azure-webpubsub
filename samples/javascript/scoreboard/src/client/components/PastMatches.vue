<template>
    <div>
        <h4>Past Matches</h4>
        <el-row v-for="c in cards" :key="c">
            <el-col :span="24">
                <el-card :body-style="cardBodyStyle">
                    <el-row class="horizontal-center">
                        <el-col :span="24">
                            <el-row class="match horizontal-center" v-for="(s, i) in c.scores" :key="i">
                                <el-col :span="3">
                                    <img class="thumbnail-image" :src="c.thumbnails[i].value" />
                                </el-col>
                                <el-col class="horizontal-center" :span="2" :offset="1"> {{ c.teams[i] }} </el-col>
                                <el-col class="horizontal-center" :offset="10" :span="1"> {{ s }}</el-col>
                            </el-row>
                        </el-col>
                    </el-row>
                </el-card>
            </el-col>
        </el-row>
    </div>
</template>

<script lang="ts" setup>
import { ref, Ref } from 'vue'
import { useStore } from 'vuex'
import { MatchSummaryListPayload } from '../../models/payloads/MatchSummaryListPayload'
import { ScoreboardSourceOptions } from '../ScoreboardSourceOptions'
import utils from '../utils'

interface Card {
    teams: [string, string]
    scores: [number, number]
    thumbnails: [Ref<string>, Ref<string>]
}

const cardBodyStyle = {
    'padding-top': '20px',
    'padding-bottom': '20px',
    'padding-left': '30px',
    'padding-right': '30px',
}
const cards = ref(new Array<Card>())
const store = useStore()
const options = store.state.source.options.value as ScoreboardSourceOptions

options.onGettingPastMatchSummaryList = (payload: MatchSummaryListPayload): void => {
    cards.value.length = 0
    payload.list.forEach(s => {
        cards.value.push({ teams: [s.teams.teamL, s.teams.teamR], thumbnails: [ref(''), ref('')], scores: s.finalScores })
        const c = cards.value[cards.value.length - 1]
        utils.updateImage(`images/thumbnails/${s.teams.teamL}.png`, c.thumbnails[0])
        utils.updateImage(`images/thumbnails/${s.teams.teamR}.png`, c.thumbnails[1])
    })
}
</script>

<style lang="scss" scoped>
.el-row {
    margin-bottom: 20px;
    &:last-child {
        margin-bottom: 0;
    }
}
.match {
    color: #666;
    margin-bottom: 15px;
    &:last-child {
        margin-bottom: 0;
    }
}
.arrow-right {
    height: auto;
    color: #bbb;
}
.thumbnail-image {
    object-fit: contain;
    height: 3vh;
}
</style>
