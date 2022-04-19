import React from 'react'
import { Image, ImageFit, Label, Stack, StackItem, PrimaryButton } from '@fluentui/react'
import * as styles from './styles.module'

export default function Feedback(): JSX.Element {
  return (
    <Stack horizontal wrap styles={styles.background}>
      <Stack grow horizontal horizontalAlign="start" styles={styles.left}>
        <StackItem styles={styles.leftItem}>
          <div style={styles.content}>
            <Label style={styles.title}>Scoreboard demo</Label>
            <Label>description to the demo</Label>
          </div>
          <PrimaryButton text="Launch demo"></PrimaryButton>
        </StackItem>
      </Stack>
      <Stack grow horizontal horizontalAlign="end">
        <Image imageFit={ImageFit.none} src="/img/introduction.png" alt="demo introduction" style={styles.preview}></Image>
      </Stack>
    </Stack>
  )
}
