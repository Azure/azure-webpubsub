import React from 'react'
import { Stack, SearchBox, Label, ImageIcon, FontIcon, Link } from '@fluentui/react'
import * as styles from './styles.module'

export default function Sidebar(): JSX.Element {
  return (
    <Stack styles={styles.sidebar} tokens={styles.tokens}>
      <Label styles={styles.title}>Useful links</Label>
      <Link>Write a review</Link>
      <Link>Share to social media</Link>
      <Link>View documentation</Link>
      <Link>Go to Github project page</Link>
    </Stack>
  )
}
