---
layout: docs
toc: true
group: specs
---
# Azure Web PubSub Service REST API
## Version: 2020-10-01

### Available APIs

| API | Path | Method |
| ---- | ---------- | ----------- |
| Get service health status. | /api/health | HEAD |
| Broadcast content inside request body to all the connected client connections | /api/hubs/{hub}/:send | POST |
| Check if the connection with the given connectionId exists | /api/hubs/{hub}/connections/{connectionId} | HEAD |
| Close the client connection | /api/hubs/{hub}/connections/{connectionId} | DELETE |
| Send content inside request body to the specific connection. | /api/hubs/{hub}/connections/{connectionId}/:send | POST |
| Check if there are any client connections inside the given group | /api/hubs/{hub}/groups/{group} | HEAD |
| Send content inside request body to a group of connections. | /api/hubs/{hub}/groups/{group}/:send | POST |
| Add a connection to the target group. | /api/hubs/{hub}/groups/{group}/connections/{connectionId} | PUT |
| Remove a connection from the target group. | /api/hubs/{hub}/groups/{group}/connections/{connectionId} | DELETE |
| Check if there are any client connections connected for the given user | /api/hubs/{hub}/users/{user} | HEAD |
| Send content inside request body to the specific user. | /api/hubs/{hub}/users/{id}/:send | POST |
| Check whether a user exists in the target group. | /api/hubs/{hub}/users/{user}/groups/{group} | HEAD |
| Add a user to the target group. | /api/hubs/{hub}/users/{user}/groups/{group} | PUT |
| Remove a user from the target group. | /api/hubs/{hub}/users/{user}/groups/{group} | DELETE |
| Remove a user from all groups. | /api/hubs/{hub}/users/{user}/groups | DELETE |
| Grant permission for the connection | /api/hubs/{hub}/permissions/{permission}/connections/{connectionId} | PUT |
| Revoke permission for the connection | /api/hubs/{hub}/permissions/{permission}/connections/{connectionId} | DELETE |
| Check if a connection have permission to the specific action | /api/hubs/{hub}/permissions/{permission}/connections/{connectionId} | HEAD |

### /api/health

### /api/hubs/{hub}/:send

#### POST
##### Summary:

Broadcast content inside request body to all the connected client connections

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| excluded | query | Excluded connection Ids | No | [ string ] |
| api-version | query |  | No | string |
| payloadMessage | body |  | Yes | binary |

##### Responses

| Code | Description |
| ---- | ----------- |
| 202 | Success |
| default | Error response |

### /api/hubs/{hub}/connections/{connectionId}

#### DELETE
##### Summary:

Close the client connection

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| connectionId | path | Target connection Id | Yes | string |
| reason | query | The reason closing the client connection | No | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| default | Error response |

### /api/hubs/{hub}/connections/{connectionId}/:send

#### POST
##### Summary:

Send content inside request body to the specific connection.

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| connectionId | path | The connection Id. | Yes | string |
| api-version | query |  | No | string |
| payloadMessage | body |  | Yes | binary |

##### Responses

| Code | Description |
| ---- | ----------- |
| 202 | Success |
| default | Error response |

### /api/hubs/{hub}/groups/{group}

### /api/hubs/{hub}/groups/{group}/:send

#### POST
##### Summary:

Send content inside request body to a group of connections.

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| excluded | query | Excluded connection Ids | No | [ string ] |
| api-version | query |  | No | string |
| payloadMessage | body |  | Yes | binary |

##### Responses

| Code | Description |
| ---- | ----------- |
| 202 | Success |
| default | Error response |

### /api/hubs/{hub}/groups/{group}/connections/{connectionId}

#### PUT
##### Summary:

Add a connection to the target group.

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| connectionId | path | Target connection Id | Yes | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| 404 | Not Found |
| default | Error response |

#### DELETE
##### Summary:

Remove a connection from the target group.

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| connectionId | path | Target connection Id | Yes | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| 404 | Not Found |
| default | Error response |

### /api/hubs/{hub}/users/{user}

### /api/hubs/{hub}/users/{id}/:send

#### POST
##### Summary:

Send content inside request body to the specific user.

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| id | path | The user Id. | Yes | string |
| api-version | query |  | No | string |
| payloadMessage | body |  | Yes | binary |

##### Responses

| Code | Description |
| ---- | ----------- |
| 202 | Success |
| default | Error response |

### /api/hubs/{hub}/users/{user}/groups/{group}

#### PUT
##### Summary:

Add a user to the target group.

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| user | path | Target user Id | Yes | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| default | Error response |

#### DELETE
##### Summary:

Remove a user from the target group.

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| user | path | Target user Id | Yes | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| default | Error response |

### /api/hubs/{hub}/users/{user}/groups

#### DELETE
##### Summary:

Remove a user from all groups.

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| user | path | Target user Id | Yes | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | The user is deleted |
| default | Error response |

### /api/hubs/{hub}/permissions/{permission}/connections/{connectionId}

#### PUT
##### Summary:

Grant permission to the connection

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| permission | path | The permission, current supported actions are `joinLeaveGroup` and `sendToGroup`. | Yes | string |
| connectionId | path | Target connection Id | Yes | string |
| group | query | Optional. If not set, grant the permission to all groups. If set, grant the permission to the specific group. | No | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| default | Error response |

#### DELETE
##### Summary:

Revoke permission for the connection

##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | path | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. | Yes | string |
| permission | path | The permission, current supported actions are `joinLeaveGroup` and `sendToGroup`. | Yes | string |
| connectionId | path | Target connection Id | Yes | string |
| group | query | Optional. If not set, revoke the permission for all groups. If set, revoke the permission for the specific group. | No | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| default | Error response |
