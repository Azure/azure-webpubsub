import React from 'react'
import { Stack, SearchBox, Label, ImageIcon, FontIcon } from '@fluentui/react'
import { initializeIcons } from '@fluentui/font-icons-mdl2'
import { css } from '@fluentui/react/lib/Utilities'
import * as styles from './styles.module'

initializeIcons()

export default function NavBar(): JSX.Element {
  return (
    <div className="navbar" style={styles.root}>
      <Stack horizontal horizontalAlign="space-between" styles={styles.navBar} tokens={styles.stackTokens}>
        {/* left */}
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

        {/* center */}
        <Stack.Item grow>
          <SearchBox placeholder="Search demos by keyword. e.g. chat" styles={styles.searchBox} />
        </Stack.Item>

        {/* right */}
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
      </Stack>
    </div>
  )
}
