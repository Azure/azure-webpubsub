# Ball Physics And Networking
## Implementation Overview
The task we set out to accomplish was to enable physics prediction on all clients. This would fix issues such as floating balls and delayed shooting/throwing on clients that are not the host.

The approach we chose was State Synchronization, and Glenn Fiedler’s implementation, over on his blog, heavily inspired our resulting code: https://www.gafferongames.com/post/state_synchronization/.

The main takeaway from this is that each client runs Unity Physics locally while playing “catchup” with the data coming from the server.

## Main Scripts Involved:
- [BallNetworking.cs](../Assets/UltimateGloveBall/Scripts/Arena/Balls/BallNetworking.cs)
  - This networking script handles throwing, collisions, ownership, etc.
- [BallStateSync.cs](../Assets/UltimateGloveBall/Scripts/Arena/Balls/BallStateSync.cs)
  - This script works in unison with the previous script. 
  - Its job is to send packets with data (if server) and apply them (if client). 
  - The script includes gradual position, rotation, and linear velocity correction to avoid pops and jerky movements.
  - It also contains a jitter buffer to ensure packets are applied in the correct order and to discard any late packets.
- [BallSpawner.cs](../Assets/UltimateGloveBall/Scripts/Arena/Balls/BallSpawner.cs)
  - This script handles ball spawning and despawning of dead balls.
- [SpawnPoint.cs](../Assets/UltimateGloveBall/Scripts/Arena/Balls/SpawnPoint.cs)
  - This script checks if a ball has “claimed” it making other balls unable to spawn there.

## State Syncing balls
BallPacket
These packets are sent from the server and applied to all clients. How they are applied depends on who threw the ball.

First, let us see what is included in a packet:
- __(uint)Sequence__
  - Frame number on the server-side when the server sends the packet. 
- __State Update__
  - __(bool) IsGrabbed__
    - Let the client know if they need to be assigned to a glove.
  - __(ulong) GrabbersNetworkObjectId__
    - Tells the client which glove they need to be assigned to.
  - __(Vector3) Position__
    - The position of the ball on the server.
  - __(Quaternion) Orientation__
    - The rotation of the ball on the server.
  - __(bool) SyncVelocity__
    - Let the client know if velocity data is included in the packet.
  - __(Vector3) LinearVelocity__
    - The linear velocity of the ball on the server.
  - __(Vector3) AngularVelocity__
    - The angular velocity of the ball on the server.

### Why Do We Assign the Ball to the Glove?
We started by just synchronizing the position while someone held the ball, but the update rate and smoothing on avatars did not match with that of the balls. Then we tried reparenting the gameobject to the glove, but that was also encountering some issues as the local position and rotation could be off.
Instead of catering to these unknown factors, we decided to “simply” give the reference of the ball to the glove and the glove would drive the position of the ball while holding it.
### Some takeaways:
Using Netcode’s “Auto Parent Sync” was too slow and had to be controlled by the server. This caused issues for the player throwing the ball.
Attaching the ball to the glove gameobject and trying to sync the local position in the glove gave some off results probably due to the timing on when the event was sent and where the ball was relative to the glove. The parenting and unparenting was also incurring an unnecessary cost when we already had the logic for the ball to follow the glove.

## Applying Packets
How we apply the packets to a client depends on four factors:

### Grabbed ball?
When a ball is detected as being grabbed, we look for the glove it is supposed to parent; we then:
- Set the ball to the glove
- Disable Physics
- Reset Local Transform

When it is released and no longer parented we:
- Release the ball from the glove
- Enable physics
- Sync position/rotation/etc. 
  
### Owner of the ball?
If you are the owner of the ball, you are holding it. We do not apply any extra grabbing rules as described above.

### Did I throw the ball?
Everyone else but you will snap the ball to the new values and apply glove release of the ball rules.

### Is the ball still?
The server does not send velocity data when balls are still to reduce bandwidth. If balls are recognized as “still,” the clients will snap position, rotation, etc., to zero.

# Grabbing balls
In the current implementation, the ball grabbing is server authoritative and a client will wait on the server response to know if they grabbed a ball. This presents a small lag between the collision of the glove with the ball and the ball being in the glove.
This is an implementation choice for this demo to reduce the issues where a player could think they grabbed the ball and then they lose it because the server decided that you didn't have the ball. This incurs player frustration and in a fast pace game where multiple players could go for the same ball it can become confusing.

We do believe that there could be some gameplay mechanic that could be implemented to alleviate the perceived issue, but would require some investigation and testing to achieve a great result. Suggestions are definitely welcome see our [CONTRIBUTING](../CONTRIBUTING.md) information.
# Collisions
The balls have different states and different types that incur some challenges in terms of collision detections.

The balls that are spawned can't be hit by balls in play, so we needed to create a different physics layer for them and disable collision between the in play balls and the spawned balls.

Then there is the special electric ball. This ball was able to go through obstacles and shields but also needed to disabled these elements. To do so we created a specific physic layer for the electric ball so that it would only collide with environment and players, and then we created triggers on obstacles and shields to detect that the ball touched them but without applying physics. When the ball would enter the trigger it would apply the function to disable either the shield or obstacle.

# Noticing desynchronization
Since the balls are short lived after being thrown we have the advantage that the desyncronization of them is very small. We might encounter some visual disparity between what we think a ball hit and what happened on the server, but for the most part the colliders are large enough so we don't need an exact precision and the speed of the game makes it so that it reduce the perceived visual disparity.
