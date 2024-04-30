# Multiplayer
One of the key element this showcase wants to provide is an understanding on how to quickly integrate key multiplayer features from the platform to build a project where it's easy to interact with others and friends.

## Player to Arena options
First we have different ways to join or create a game. From the Main Menu we have 4 options that would get us in a game.
<div><img src="./Media/mainmenu.jpg" width="500"></div>
Let's dive into the different options: Quick Match, Host Match, Watch Match and Friends.

### Quick Match
The Quick Match button will start a flow where we will try to join a random room as a client through the random room photon API. If we don't find one, we then start a new room as a host.

In this mode anyone can join while there is space available. Once the room is filled a new room will be created by the extra person trying to join.

### Host Match
This creates a private Arena, only your friends can join as a spectator or player. They can join either from the friends menu, which we will cover below or by being invited.

### Watch Match
Join a random arena created by quick match to spectate. You will be sitting in the stands and can cheer the team you desire.

### Friends
The friends menu will list all your friends that you can join to play or to watch.
<div><img src="./Media/mainmenu_friends.png" width="500"></div>
By clicking Watch or Join it will start the flow to join the room as a client.

The [FriendsMenuController](../Assets/UltimateGloveBall/Scripts/MainMenu/FriendsMenuController.cs) will trigger the proper navigation flow.

## Navigation flow
The core element that will take care of the navigation flow is the [NavigationController](../Assets/UltimateGloveBall/Scripts/App/NavigationController.cs).
This is where we have different APIs to navigate through the application. In a nutshell, it will start the connection flow through the [NetworkLayer](../Packages/com.meta.multiplayer.netcode-photon/Core/NetworkLayer.cs) as well as set the new GroupPresence through the [PlayerPresenceHandler](../Assets/UltimateGloveBall/Scripts/App/PlayerPresenceHandler.cs).
Setting the group presence will enable other users to know where the player is and if they can join them and where.

Once the connection is established, the [NetworkStateHandler](../Assets/UltimateGloveBall/Scripts/App/NetworkStateHandler.cs) handles the change of network state. This is where the setup when a player is connected or disconnected takes place.

On connection we will also navigate to the right scene using the [SceneLoader](../Packages/com.meta.multiplayer.netcode-photon/Core/SceneLoader.cs). The scene loader handles the state of the scenes and how to handle scene navigation in the netcode networking state. When connected through netcode, we use the netcode scene manager which synchronizes the scene between users.

## Group Launch and Invitation
When users start a group launch to an Arena or if users are inviting each other to an existing arena we handle this in the [UGBApplication](../Assets/UltimateGloveBall/Scripts/App/UGBApplication.cs). This is where we check the information of the intent and trigger the proper navigation flow based on that information. For this project the core information needed are the Destination API and the lobbySessionId.
The lobbySessionId is used as the room name to join, where the destination API will indicate which region to join. Once we have processed that information we call the navigation controller which will bring us to the right arena and set our group presence.

## Voip
[VoipController](../Packages/com.meta.multiplayer.netcode-photon/Core/VoipController.cs) handles the setup of the voip speaker and recorder for the players. The recorder will record the local player voice and send it through the network where on other client a speaker will be created to play the received sound. It also handles checking permission to record audio from the platform.  

[VoipHandler](../Packages/com.meta.multiplayer.netcode-photon/Core/VoipHandler.cs) keeps track of the recorder or the speaker of a given entity, it makes it easier to mute and unmute the speaker or stop and start recording by keeping a reference to the recorder and speaker. This is used by the muting behaviour specified below.

## Blocking flow and muting
While in game it is possible that players can become annoying or in this context we could join a quick match where we encounter a user we already blocked.
In order to handle this, we integrated the platform API for the blocking flow. The core of the implementation can be found in the [BlockUserManager](../Packages/com.meta.multiplayer.netcode-photon/Core/BlockUserManager.cs).
On initialization we fetch the list of all users that the current user has blocked, this way we keep track of these users to be bale to handle them when we encounter them. This class also implements triggering the block and unblock flows and will track the state of all blocked users.
When the user is in the game and a player is spawned we check if that player is blocked for that user and if so we mute them. We implemented the [UserMutingManager](../Assets/UltimateGloveBall/Scripts/App/UserMutingManager.cs) to keep track of users we mute in game as well. This way we can mute them for the time of the session but not block them at the platform level.

When the [PlayerStateNetwork](../Assets/UltimateGloveBall/Scripts/Arena/Player/PlayerStateNetwork.cs) of a player is updated with that playerID or the mute state changes, it updates the speaker for that player to mute them. We also handle the blocking flow in the player menu, [PlayerInfoItem](../Assets/UltimateGloveBall/Scripts/Arena/Player/Menu/PlayerInfoItem.cs).
<div><img src="./Media/ingamemenu_players.jpg" width="500"></div>

## Invite Flow
While in the game and in pre-game phase, there is a button to invite players to join the Arena and play. This button will trigger the invite flow from [GameManager](../Assets/UltimateGloveBall/Scripts/Arena/Gameplay/GameManager.cs).
<div><img src="./Media/ingameinvite.jpg" width="500"></div>

The invite will be send through the platform. On the receiving end, it will be handled as described in the [Group Launch and Invitation](#group-launch-and-invitation) section.

## Roster
While in game, players meet other players, Random strangers, friends of friends, etc. If a player is having fun with others it is good to have a way to quickly become friends with them. That's where the Roster panel comes in play. From the in game menu, the players section, we handle the roster panel. See [PlayersMenu](../Assets/UltimateGloveBall/Scripts/Arena/Player/Menu/PlayersMenu.cs) for the implementation details.

## Arena Approval
Since we have different types of way to join, we needed to make sure that players would join arena where there is space for them.
This is done in 2 different ways. 

First we use the Photon room properties to set if a room is available for players and spectators. If a room is full for one of them we set that flag as full.
That way a player looking for a quick match or to watch a random match won't be sent to a full arena room. The implementation can be seen in [PhotonConnectionHandler](../Assets/UltimateGloveBall/Scripts/App/PhotonConnectionHandler.cs), where we set properties we look for when joining or creating a room, and [ArenaApprovalController](../Assets/UltimateGloveBall/Scripts/Arena/Services/ArenaApprovalController.cs), where we update the the properties of the room.

Which brings us to the second check, the [ArenaApprovalController](../Assets/UltimateGloveBall/Scripts/Arena/Services/ArenaApprovalController.cs). This class implements the approval check for netcode. It is run only on the host and keeps track of how many users joined of each type. If more users try to connect than it is allowed, it will disconnect that player and send a reason. This is mainly to handle cases where player A tries to join their friend player B where the arena is full.

## Group Presence
Has mentioned above, we set the group presence when the user changes scene and networked room so that others can easily join them. The main implementation is done in [GroupPresenceState](../Packages/com.meta.multiplayer.netcode-photon/Core/GroupPresenceState.cs) which implement the group presence API
and keeps the state locally for reference.

## Photon with Netcode for GameObject
To develop this project we used Photon and Netcode for GameObject. There was already a pretty good photon wrapper to integrate it as a transport layer to netcode. But for the project we wanted to do we found that it was lacking some key photon features implementation.
We copied the package [here](../Packages/com.community.netcode.transport.photon-realtime@b28923aa5d) and implemented some additional features. We tried to keep it as project agnostic as possible so that it can easily be reused for other projects.

Some core differences:
* Add intent on connection, either as client, host, or to the lobby. [PhotonRealtimeTransport](../Packages/com.community.netcode.transport.photon-realtime@b28923aa5d/Runtime/PhotonRealtimeTransport.cs)
* Add private room, where we set the visible flag when we create a room.
* Add region override in order to be able to change regions.
* Support join random room failure. [PhotonRealtimeTransport](../Packages/com.community.netcode.transport.photon-realtime@b28923aa5d/Runtime/PhotonRealtimeTransport.Matchmaking.cs)
* Add function call to handle room creation with parameters. The parameters getter function can be hooked to the [PhotonRealtimeTransport.Connection](../Packages/com.community.netcode.transport.photon-realtime@b28923aa5d/Runtime/PhotonRealtimeTransport.Connection.cs) at runtime and gives full ownership to the project on how to create the rooms.
