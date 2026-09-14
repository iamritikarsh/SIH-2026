import os
filepath = 'backend/simulation.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

target = 'self.events = []\n        self.alerts = []'
repl = 'self.events = []\n        if not hasattr(self, \"cam_events\"): self.cam_events = {c.id: [] for c in CAMERAS}\n        self.alerts = []'
content = content.replace(target, repl)

target_trigger = 'self.events.insert(0, event)\n        self.total_detected_count += 1\n        if len(self.events) > 800:\n            self.events = self.events[:800]'
repl_trigger = target_trigger + '\n        \n        if not hasattr(self, \"cam_events\"): self.cam_events = {}\n        if cam_id not in self.cam_events: self.cam_events[cam_id] = []\n        self.cam_events[cam_id].insert(0, event)\n        if len(self.cam_events[cam_id]) > 6: self.cam_events[cam_id] = self.cam_events[cam_id][:6]'
content = content.replace(target_trigger, repl_trigger)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
