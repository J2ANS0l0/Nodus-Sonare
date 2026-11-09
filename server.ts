import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb"

const app = express()
const PORT = 5002

// DynamoDB Configuration
// These can be moved to environment variables for easy AWS migration
const dynamo_config = {
  region: "us-east-1",
  endpoint: process.env.DYNAMODB_ENDPOINT || "http://localhost:8002",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin123",
  },
}

const client = new DynamoDBClient(dynamo_config)
const doc_client = DynamoDBDocumentClient.from(client)

app.use(cors())
app.use(express.json())

const clients = new Set<express.Response>()

let last_track: object | null = null

const fetch_nodes_from_dynamo = async () => {
  try {
    const command = new ScanCommand({
      TableName: "node",
    })
    const response = await doc_client.send(command)
    return JSON.stringify(response.Items || [])
  } catch (error) {
    console.error("Error fetching from DynamoDB:", error)
    return "[]"
  }
}

const broadcast = (line: string) => {
  clients.forEach(res => res.write(`data: ${line}\n\n`))
}

const broadcast_track = (track: object) => {
  const payload = JSON.stringify({ __type: 'track', track })
  clients.forEach(res => res.write(`data: ${payload}\n\n`))
}

let last_content = ''
setInterval(async () => {
  try {
    const current = await fetch_nodes_from_dynamo()
    if (current !== last_content) {
      last_content = current
      broadcast(current)
    }
  } catch {}
}, 1000) // Increased interval slightly for DynamoDB scan

app.get('/api/nodes', async (_req, res) => {
  try {
    const nodes = await fetch_nodes_from_dynamo()
    res.json(JSON.parse(nodes))
  } catch {
    res.status(500).json({ error: 'Failed to fetch nodes from DynamoDB' })
  }
})

app.get('/api/nodes/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    const line = await fetch_nodes_from_dynamo()
    last_content = line
    res.write(`data: ${line}\n\n`)
  } catch {}

  if (last_track) {
    const payload = JSON.stringify({ __type: 'track', track: last_track })
    res.write(`data: ${payload}\n\n`)
  }

  clients.add(res)

  req.on('close', () => {
    clients.delete(res)
  })
})

app.get('/api/current_track', (_req, res) => {
  if (last_track) {
    res.json(last_track)
  } else {
    res.status(204).end()
  }
})

app.post('/api/node_selected', (req, res) => {
  const { id, name, content } = req.body
  console.log(`[Backend] Node Selected: ${name} (ID: ${id})`)
  console.log(`[Backend] Content:`, content)

  if (content && content.music_id) {
    last_track = content
    broadcast_track(content)
  }

  res.sendStatus(200)
})

app.post('/api/like', async (req, res) => {
  const { username, music_node_id } = req.body;
  if (!username || !music_node_id) {
    return res.status(400).json({ error: 'username and music_node_id are required' });
  }

  try {
    const scan_command = new ScanCommand({
      TableName: "node",
      FilterExpression: "node_type = :type AND (node_name = :name OR author_name = :name)",
      ExpressionAttributeValues: {
        ":type": "Author",
        ":name": username
      }
    });
    const scan_result = await doc_client.send(scan_command);
    const user_node = scan_result.Items?.[0];

    if (!user_node) {
      return res.status(404).json({ error: "User not found" });
    }

    const node_id = user_node.node_id;
    let likes = user_node.node_music_likes || [];

    if (likes.includes(music_node_id)) {
      likes = likes.filter((id: string) => id !== music_node_id);
    } else {
      likes.push(music_node_id);
    }

    const put_command = new PutCommand({
      TableName: "node",
      Item: { ...user_node, node_music_likes: likes }
    });
    await doc_client.send(put_command);

    console.log(`[Backend] User ${username} toggled like for music node ${music_node_id}`);
    res.json({ message: "Success", likes });
  } catch (error) {
    console.error("Error toggling like in DynamoDB:", error);
    res.status(500).json({ error: "Failed to update likes" });
  }
});

app.post('/api/profile/update', async (req, res) => {
  const { node_id, author_description, node_color, node_name, author_name } = req.body;
  if (!node_id) {
    return res.status(400).json({ error: 'node_id is required' });
  }

  try {
    const scan_command = new ScanCommand({
      TableName: "node",
      FilterExpression: "node_id = :id",
      ExpressionAttributeValues: {
        ":id": node_id
      }
    });
    const scan_result = await doc_client.send(scan_command);
    const user_node = scan_result.Items?.[0];

    if (!user_node) {
      return res.status(404).json({ error: "Node not found" });
    }

    const updated_node = {
      ...user_node,
      author_description: author_description !== undefined ? author_description : user_node.author_description,
      node_color: node_color !== undefined ? node_color : user_node.node_color,
      node_name: node_name !== undefined ? node_name : user_node.node_name,
      author_name: author_name !== undefined ? author_name : user_node.author_name,
    };

    const put_command = new PutCommand({
      TableName: "node",
      Item: updated_node
    });
    await doc_client.send(put_command);

    console.log(`[Backend] Profile updated for node ${node_id}`);
    res.json({ message: "Success", node: updated_node });
  } catch (error) {
    console.error("Error updating profile in DynamoDB:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.post('/api/album/upload', async (req, res) => {
  const { album_name, author_name, cover_url, general_tag, tracks, posted_by } = req.body;
  if (!album_name || !author_name || !tracks || !Array.isArray(tracks)) {
    return res.status(400).json({ error: 'Album name, author name, and tracks are required' });
  }

  try {
    const scan_command = new ScanCommand({ TableName: "node" });
    const scan_result = await doc_client.send(scan_command);
    const nodes = scan_result.Items || [];

    // Find Author node
    let author_node = nodes.find(n => n.node_type === 'Author' && (n.node_name === author_name || n.author_name === author_name));
    
    if (!author_node) {
      author_node = nodes.find(n => n.node_type === 'Author' && (n.node_name === posted_by || n.author_name === posted_by));
    }

    if (!author_node) {
      return res.status(404).json({ error: 'Author node not found. Please ensure the author exists.' });
    }

    const author_node_id = author_node.node_id;
    let max_node_id = 0;
    let max_music_id = 0;
    nodes.forEach(n => {
      const nid = parseInt(n.node_id);
      if (!isNaN(nid) && nid > max_node_id) max_node_id = nid;
      
      const mid = parseInt(n.music_id);
      if (!isNaN(mid) && mid > max_music_id) max_music_id = mid;
    });

    const album_nodes = [];
    const tags_to_update: Record<string, any> = {};

    const get_or_create_tags = async (tag_names_string: string) => {
      if (!tag_names_string) return [];
      const tag_names = tag_names_string.split(',').map(t => t.trim()).filter(t => t !== '');
      const tag_nodes = [];

      for (const tag_name of tag_names) {
        let tag_node = nodes.find(n => n.node_type === 'Tag' && n.node_name === tag_name);
        if (!tag_node) {
          max_node_id++;
          const new_node_id = String(max_node_id);
          tag_node = {
            "node_id": new_node_id,
            "node_type": "Tag",
            "node_name": tag_name,
            "node_color": "#" + Math.floor(Math.random()*16777215).toString(16),
            "node_music_links_next": [],
            "node_music_links_previous": [],
            "node_tag_links_next": [],
            "node_tag_links_previous": [],
            "node_author_links_next": [],
            "node_author_links_previous": [],
            "node_album_links_next": [],
            "node_album_links_previous": []
          };
          nodes.push(tag_node);
          await doc_client.send(new PutCommand({ TableName: "node", Item: tag_node }));
        }
        tag_nodes.push(tag_node);
      }
      return tag_nodes;
    };

    const general_tag_nodes = await get_or_create_tags(general_tag);
    const all_tag_ids_used = new Set<string>();
    general_tag_nodes.forEach(t => all_tag_ids_used.add(t.node_id));

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const new_node_id = String(max_node_id + 1);
      max_node_id++;
      const new_music_id = String(max_music_id + 1);
      max_music_id++;

      const track_tag_nodes = await get_or_create_tags(track.tag);
      const track_tag_ids: string[] = Array.from(new Set([
        ...general_tag_nodes.map(t => t.node_id),
        ...track_tag_nodes.map(t => t.node_id)
      ]));
      
      track_tag_ids.forEach(id => all_tag_ids_used.add(id));

      const new_node = {
        "node_id": new_node_id,
        "node_type": "Music",
        "node_name": track.name,
        "node_color": author_node.node_color || "#F28705",
        "node_music_links_next": [],
        "node_music_links_previous": [],
        "node_tag_links_next": track_tag_ids,
        "node_tag_links_previous": [],
        "node_author_links_next": [author_node_id],
        "node_author_links_previous": [],
        "node_album_links_next": i < tracks.length - 1 ? [String(parseInt(new_node_id) + 1)] : [],
        "node_album_links_previous": i > 0 ? [String(parseInt(new_node_id) - 1)] : [],
        "music_id": new_music_id,
        "music_name": track.name,
        "music_description": track.description || `${track.name} from ${author_name}`,
        "music_author": author_name,
        "music_cover_url": cover_url,
        "music_url": track.url,
        "music_album": album_name,
        "likes": 0,
        "views": 0,
        "shares": 0,
        "comments": 0
      };
      album_nodes.push(new_node);

      // Prepare tag updates
      for (const tag_id of track_tag_ids) {
        if (!tags_to_update[tag_id]) {
          tags_to_update[tag_id] = nodes.find(n => n.node_id === tag_id);
        }
        if (!tags_to_update[tag_id].node_music_links_next.includes(new_node_id)) {
          tags_to_update[tag_id].node_music_links_next.push(new_node_id);
        }
        // Link Tag -> Author as well
        if (!tags_to_update[tag_id].node_author_links_next.includes(author_node_id)) {
          tags_to_update[tag_id].node_author_links_next.push(author_node_id);
        }
      }
    }

    // Save Music nodes
    for (const node of album_nodes) {
      await doc_client.send(new PutCommand({
        TableName: "node",
        Item: node
      }));
    }

    // Save Tag updates
    for (const tag_id in tags_to_update) {
      await doc_client.send(new PutCommand({
        TableName: "node",
        Item: tags_to_update[tag_id]
      }));
    }

    // Update Author node's music_links AND tag_links
    const updated_author_node = {
      ...author_node,
      node_music_links_next: [...(author_node.node_music_links_next || []), ...album_nodes.map(n => n.node_id)],
      node_tag_links_next: Array.from(new Set([...(author_node.node_tag_links_next || []), ...all_tag_ids_used]))
    };
    await doc_client.send(new PutCommand({
      TableName: "node",
      Item: updated_author_node
    }));

    console.log(`[Backend] Album "${album_name}" by ${author_name} uploaded with ${tracks.length} tracks.`);
    res.status(201).json({ message: 'Album uploaded successfully', count: tracks.length });
  } catch (error) {
    console.error("Error uploading album to DynamoDB:", error);
    res.status(500).json({ error: "Failed to upload album" });
  }
});

app.post('/api/register', async (req, res) => {
  const { username, real_name, description } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const scan_command = new ScanCommand({
      TableName: "node",
    });
    const scan_result = await doc_client.send(scan_command);
    const nodes = scan_result.Items || [];

    // Check if user already exists
    const exists = nodes.some(n => n.node_type === 'Author' && (n.node_name === username || n.author_name === username));
    if (exists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Determine next IDs
    let max_node_id = 0;
    let max_author_id = 0;
    nodes.forEach(n => {
      const nid = parseInt(n.node_id);
      if (!isNaN(nid) && nid > max_node_id) max_node_id = nid;
      
      if (n.node_type === 'Author') {
        const aid = parseInt(n.author_id);
        if (!isNaN(aid) && aid > max_author_id) max_author_id = aid;
      }
    });

    const new_node_id = String(max_node_id + 1);
    const new_author_id = String(max_author_id + 1);

    const new_node = {
      "node_id": new_node_id,
      "node_type": "Author",
      "node_name": username,
      "node_color": "#FF0000",
      "node_music_links_next": [],
      "node_music_links_previous": [],
      "node_tag_links_next": [],
      "node_tag_links_previous": [],
      "node_author_links_next": [],
      "node_author_links_previous": [],
      "node_album_links_next": [],
      "node_album_links_previous": [],
      "author_id": new_author_id,
      "author_name": username,
      "author_real_name": real_name || username,
      "author_description": description || "New user",
      "author_profile_picture": "",
      "node_music_likes": []
    };

    const put_command = new PutCommand({
      TableName: "node",
      Item: new_node,
    });
    await doc_client.send(put_command);

    console.log(`[Backend] New user registered and Author node created: ${username} (Node ID: ${new_node_id}, Author ID: ${new_author_id})`);
    res.status(201).json({ message: 'User registered successfully', node: new_node });
  } catch (error) {
    console.error("Error registering user in DynamoDB:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

app.post('/api/music', async (req, res) => {
  try {
    const item = req.body
    const command = new PutCommand({
      TableName: "node",
      Item: item,
    })
    await doc_client.send(command)
    console.log(`[Backend] Music item added to node table: ${item.music_name || item.node_name}`)
    res.status(201).json({ message: 'Music item created successfully in node table', item })
  } catch (error) {
    console.error("Error creating music item in node table:", error)
    res.status(500).json({ error: 'Failed to create music item' })
  }
})

createServer(app).listen(PORT, () => {
  console.log(`Graph API running on http://localhost:${PORT}`)
})
