<template>
    <el-row :gutter="20">
        <el-col :xs="24" :sm="24" :md="8" :lg="8" :xl="8" v-for="(c, i) in cards" :key="i">
            <el-card class="box-card">
                <el-row justify="center">
                    <el-radio v-model="selectedIndex" :label="i"> &nbsp; </el-radio>
                </el-row>
                <el-row justify="space-around" class="horizontal-center">
                    <img class="thumbnail-image" :src="c.thumbnails[0].value" aria-label="thumbnail image"/>
                    {{ c.scores[0] + ' : ' + c.scores[1] }}
                    <img class="thumbnail-image" :src="c.thumbnails[1].value" aria-label="thumbnail image"/>
                </el-row>
            </el-card>
        </el-col>
    </el-row>
</template>

<script lang="ts" setup>
import { watch, ref, Ref } from 'vue'
import { useStore } from 'vuex'
import { MatchSummaryListPayload } from '../../models/payloads/MatchSummaryListPayload'
import { MatchTeams } from '../../models/MatchTeams'
import { ScoreboardSourceOptions } from '../ScoreboardSourceOptions'
import { RealtimeMatchDetailsPayload } from '../../models/payloads/RealtimeMatchDetailsPayload'
import * as clientUtils from '../../client/utils'
import utils from '../../common/utils'
import { ScoreSource } from '../ScoreSource'

interface Card {
    thumbnails: [Ref<string>, Ref<string>]
    scores: [number, number]
    teams: [string, string]
}

const store = useStore()
const selectedIndex = ref(-1)
const cards = ref(new Array<Card>())
const options = store.state.source.options.value as ScoreboardSourceOptions
options.onGettingLiveMatchSummaryList = (payload: MatchSummaryListPayload) => {
    cards.value.length = 0
    const source = store.state.source.instance as ScoreSource
    payload.list.map(s => {
        const thumbnails: [Ref<string>, Ref<string>] = [ref(''), ref('')]
        cards.value.push({ thumbnails, scores: [0, 0], teams: [s.teams.teamL, s.teams.teamR] })
        clientUtils.default.updateImage(`images/thumbnails/${s.teams.teamL}.png`, thumbnails[0])
        clientUtils.default.updateImage(`images/thumbnails/${s.teams.teamR}.png`, thumbnails[1])
        source.subscribeMatch(s.teams)
    })
    selectedIndex.value = 0
}
options.onGettingRealtimeMatchDetailsScore.push((payload: RealtimeMatchDetailsPayload) =>
    cards.value.filter(c => utils.getId(new MatchTeams(c.teams[0], c.teams[1])) === utils.getId(payload.teams)).forEach(c => (c.scores = payload.scores)),
)

watch(selectedIndex, index => {
    const card = cards.value[index]
    const teams = new MatchTeams(card.teams[0], card.teams[1])
    store.commit('updateCurrentSelectedMatch', teams)
})
</script>

<style lang="scss" scoped>
.thumbnail-image {
    object-fit: contain;
    height: 3vh;
}
.box-card {
    margin-bottom: 20px;
}
</style>
