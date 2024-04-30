# Code Structure
This project is separated into 2 main structures. First is the [Meta Multiplayer for Netcode and Photon](../Packages/com.meta.multiplayer.netcode-photon) package which is core reusable code that can easily be used to start a new project using similar configuration for a multiplayer game. Then there is the [UltimateGloveBall](../Assets/UltimateGloveBall) which uses the Meta Multiplayer base and implements the specific game logic.

We also have a package of common utility functionality that helped us speed up the implementation of our project, these utilities can be found in [Packages/com.meta.utilities](../Packages/com.meta.utilities).

We also needed to extend the functionality of Photon Realtime for Netcode and to do so we made a copy of the package in [Packages/com.community.netcode.transport.photon-realtime](../Packages/com.community.netcode.transport.photon-realtime@b28923aa5d).

# Meta Multiplayer for Netcode and Photon
Project agnostic logic that can be reused in any project. It is implementing different elements required for a networked multiplayer project. It also contains some key features implementation from our Platform Social API.

[BlockUserManager.cs](../Packages/com.meta.multiplayer.netcode-photon/Core/BlockUserManager.cs) implements the blocking flow API.

[GroupPresenceState.cs](../Packages/com.meta.multiplayer.netcode-photon/Core/GroupPresenceState.cs) implements the usage of group presence API which is the base for players to play together easily.

[NetworkLayer.cs](../Packages/com.meta.multiplayer.netcode-photon/Core/NetworkLayer.cs) implements the network state for client/host connection flow and disconnection handling as well as host migration.

The implementation of the networked Avatar is key in integrating personality in a project and a good example on how avatars can easily be integrated in a project ([Avatars](../Packages/com.meta.multiplayer.netcode-photon/Avatar)).

# Ultimate Glove Ball
This is the implementation of the specifics of the game. I will highlight some of the key components, but strongly encourage you to dive into the code.

## Application
The application starts through the [UGBApplication](../Assets/UltimateGloveBall/Scripts/App/UGBApplication.cs) script. This is where the main systems are instantiated for the lifetime of the application. It implements the core for the navigation through the app, the handling of the network logic, setup for the users group presence and deciding where to load the user initially.

In the [UltimateGloveBall/Scripts/App](../Assets/UltimateGloveBall/Scripts/App) you will find the implementation of the core elements for the application.

## Main Menu
The next element we will talk about is the [MainMenu directory](../Assets/UltimateGloveBall/Scripts/MainMenu). It contains the controllers and views that are used in the Main Menu scene. It's setup in a way where we could easily extend the number of menus and navigation between them. The [MainMenuController.cs](../Assets/UltimateGloveBall/Scripts/MainMenu/MainMenuController.cs) is the core logic of the scene and handles all states and transition as well as communicating with the core services.

## Arena
Finally the bigger piece is the [Arena directory](../Assets/UltimateGloveBall/Scripts/Arena). This contains all the gameplay logic when we enter the Arena.

### Services
Since we have 2 modes of joining the Arena (player or spectator) we needed a way to ensure no more than the maximum users for a given role would join the room, this is what the [ArenaApprovalController](../Assets/UltimateGloveBall/Scripts/Arena/Services/ArenaApprovalController.cs) implements.

Then we need to spawn the players in the right location and on the right teams, which is handled by the [ArenaPlayerSpawningManager](../Assets/UltimateGloveBall/Scripts/Arena/Services/ArenaPlayerSpawningManager.cs).

### Players
The construction of a player is interesting to dig into once spawned as it is composed of multiple networked objects. There is the player avatar which is the core element of a player and then we spawn the glove armatures and the gloves themselves as they interact separately on a network level but are all part on the player entity. These can be found in [Scripts/Arena/Player](../Assets/UltimateGloveBall/Scripts/Arena/Player).

### Spectators
In spectator mode, we opted to keep the networking simple and reuse the crowd bodies and animations. The user does have agency on what item they show on their character and they also control a firework launcher. To reduce network event, when a spectator changes their item we wait a certain amount of time before synchronizing it to the server, this is so we don't spam the server with constant events if the user is changing items rapidly.
The spectator code can be found in [Scripts/Arena/Spectator](../Assets/UltimateGloveBall/Scripts/Arena/Spectator).

### Balls
Finally the main networking element is the [balls](../Assets/UltimateGloveBall/Scripts/Arena/Balls). The ball is separated into 3 main components, the ball network, the ball state synchronizer, and the specific ball behaviours.

The ball networking handles the different network state of the balls like ownership, spawned or dead state, as well as gameplay logic like collisions and server and client rpc for throwing or dropping the ball.

The ball state sychronizer handles the position and movement of the ball, you can read more in details in the [ball physics and networking](./BallPhysicsAndNetworking.md) documentation.

# Photon Realtime Transport for Netcode
We modified this packages to have more flexibility when navigating through the photon rooms. We added support for connection to lobbies and have different intents when trying to connect.

An additional feature we added was to integrate the possibility to use room properties when connecting so that we can join specific types of room. We implemented it in a way that is easy to reuse between projects by giving the power of specific implementation to the game by assigning callbacks and handlers of data.
