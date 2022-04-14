import React from 'react'
import { Stack, StackItem, Label } from '@fluentui/react'
import * as styles from './styles.module'
import Story from './Story'

export default function CustomerStories(): JSX.Element {
  return (
    <Stack>
      <StackItem>
        <Stack horizontal horizontalAlign="center">
          <StackItem>
            <Label styles={styles.title}>How our customers talk about us</Label>
          </StackItem>
        </Stack>
      </StackItem>
      <StackItem>
        <Stack horizontal horizontalAlign="space-between">
          <StackItem grow>
            <Story></Story>
          </StackItem>
          <StackItem grow>
            <Story></Story>
          </StackItem>
          <StackItem grow>
            <Story></Story>
          </StackItem>
        </Stack>
      </StackItem>
    </Stack>
  )
}
