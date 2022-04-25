import React from 'react'
import { Stack, SearchBox, Label, ImageIcon, FontIcon } from '@fluentui/react'
import { initializeIcons } from '@fluentui/font-icons-mdl2'
import { css } from '@fluentui/react/lib/Utilities'
import { IsWideDevice } from '@site/src/utils/CssUtils'
import * as styles from './styles.module'

initializeIcons()

function Brand(): JSX.Element {
  return (
    <Stack.Item grow>
      <Stack horizontal tokens={styles.leftNavTokens} styles={styles.leftNav}>
        <Stack.Item>
          <Stack>
            <ImageIcon
              className={styles.classNames.logo}
              aria-label="Locked"
              imageProps={{
                src: '/img/logo.png',
                alt: 'logo',
                className: css(styles.classNames.image, styles.classNames.logoImage),
              }}
            />
          </Stack>
        </Stack.Item>
        <Stack.Item>
          <Label styles={styles.title}>Web PubSub Service Demo Platform</Label>
        </Stack.Item>
      </Stack>
    </Stack.Item>
  )
}

function Search(): JSX.Element {
  return (
    <Stack.Item grow>
      <SearchBox placeholder="Search demos by keyword. e.g. chat" styles={styles.searchBox} />
    </Stack.Item>
  )
}

function Contact(): JSX.Element {
  return (
    <Stack.Item grow>
      <Stack horizontal horizontalAlign="end" tokens={styles.rightNavTokens} styles={styles.rightNav}>
        <Stack.Item>
          <FontIcon aria-label="Chat" iconName="ChatInviteFriend" className={styles.classNames.navBarIcon} />
        </Stack.Item>
        <Stack.Item>
          <FontIcon aria-label="Question" iconName="StatusCircleQuestionMark" className={styles.classNames.navBarIcon} />
        </Stack.Item>
      </Stack>
    </Stack.Item>
  )
}

function NavBarDesktop(): JSX.Element {
  return (
    <div className="navbar" style={styles.root}>
      <Stack horizontal horizontalAlign="space-between" styles={styles.navBar} tokens={styles.stackTokens}>
        <Brand></Brand>
        <Search></Search>
        <Contact></Contact>
      </Stack>
    </div>
  )
}

function NavBarMobile(): JSX.Element {
  return (
    <div className="navbar" style={styles.root}>
      <Stack>
        <Stack horizontal horizontalAlign="space-between" styles={styles.navBar} tokens={styles.stackTokens}>
          <Brand></Brand>
          <Contact></Contact>
        </Stack>
        <Stack horizontal horizontalAlign="space-between" styles={styles.navBar} tokens={styles.stackTokens}>
          <Search></Search>
        </Stack>
      </Stack>
    </div>
  )
}

export default function NavBar(): JSX.Element {
  const isWide = IsWideDevice()
  return isWide ? NavBarDesktop() : NavBarMobile()
}
