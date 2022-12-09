// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Microsoft.WindowsAzure.Storage.Table;
using System;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class ChatEntity : TableEntity
    {
        public string From { get; set; }
        public string To { get; set; }
        public string Text { get; set; }

        public ChatEntity() { }
        public ChatEntity(string pkey, string rkey, Chat chat)
        {
            PartitionKey = pkey;
            RowKey = rkey;
            From = chat.from;
            To = chat.to;
            Text = chat.text;
        }

        public Chat ToChat()
        {
            return new Chat(Text, From, To, int.Parse(RowKey));
        }
    }
}
