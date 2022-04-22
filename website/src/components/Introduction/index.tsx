import React from 'react'
import { Image, ImageFit, Label, Stack, StackItem, PrimaryButton } from '@fluentui/react'
import * as styles from './styles.module'
import { IsWideDevice } from '@site/src/utils/CssUtils'

export default function Feedback(): JSX.Element {
  const isWide = IsWideDevice()
  return (
    <Stack horizontal wrap reversed styles={styles.background}>
      <Stack grow horizontal horizontalAlign={isWide ? 'end' : 'center'} styles={styles.tryDemo}>
        <StackItem styles={styles.tryDemoItem}>
          <div style={styles.content}>
            <Label style={styles.title}>Scoreboard demo</Label>
            <Label>description to the demo</Label>
          </div>
          <PrimaryButton text="Launch demo"></PrimaryButton>
        </StackItem>
      </Stack>
      <Stack grow horizontal horizontalAlign={isWide ? 'start' : 'center'}>
        <Image imageFit={ImageFit.none} src="/img/introduction.png" alt="demo introduction" style={styles.preview}></Image>
      </Stack>
    </Stack>
  )
}
