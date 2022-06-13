import React from 'react'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import { Stack, SearchBox, Label, ImageIcon, FontIcon, Link } from '@fluentui/react'
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
            <Link href="/">
              <ImageIcon
                className={styles.classNames.logo}
                aria-label="Locked"
                imageProps={{
                  src: '/img/logo.png',
                  alt: 'logo',
                  className: css(styles.classNames.image, styles.classNames.logoImage),
                }}
              />
            </Link>
          </Stack>
        </Stack.Item>
        <Stack.Item>
          <Link href="/">
            <Label styles={styles.title}>Web PubSub Service Demo Platform</Label>
          </Link>
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
  const { siteConfig } = useDocusaurusContext()
  const status = siteConfig.customFields.developmentStatus

  return (
    <Stack.Item grow>
      {status.isContactNavBarReady && (
        <Stack horizontal horizontalAlign="end" tokens={styles.rightNavTokens} styles={styles.rightNav}>
          <Stack.Item>
            <FontIcon aria-label="Chat" iconName="ChatInviteFriend" className={styles.classNames.navBarIcon} />
          </Stack.Item>
          <Stack.Item>
            <FontIcon aria-label="Question" iconName="StatusCircleQuestionMark" className={styles.classNames.navBarIcon} />
          </Stack.Item>
        </Stack>
      )}
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
