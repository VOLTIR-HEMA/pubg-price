import json
import os
import subprocess
import sys
import threading
import time
import tkinter as tk
from pathlib import Path

import pyautogui
import requests
from PIL import Image, ImageDraw
from pystray import Icon as TrayIcon
from pystray import Menu, MenuItem

# --- Configuration ---#
VERSION = "1.0.0"
BASE_URL = "https://caffe-2003-default-rtdb.firebaseio.com"
CONFIG_FILE = "config.json"
GITHUB_RAW_URL = "https://raw.githubusercontent.com/اسم-حسابك/اسم-المستودع/main/agent/agent.py"
class Agent:
    def __init__(self):
        self.pc_id = self.get_pc_id()
        self.device_url = f"{BASE_URL}/devices/{self.pc_id}.json"
        self.settings_url = f"{BASE_URL}/settings.json"
        self.is_running = True
        self.overlay = None
        self.last_state = {}

        # Start the overlay in its own thread
        self.overlay_thread = threading.Thread(target=self.run_overlay, daemon=True)
        self.overlay_thread.start()

    def get_pc_id(self):
        config_path = Path(CONFIG_FILE)
        if config_path.exists():
            with open(config_path, 'r') as f:
                return json.load(f).get("pc_id")
        else:
            while True:
                try:
                    pc_num = int(input("Enter PC ID (e.g. 1, 2, 5): "))
                    pc_id = f"PC-{pc_num:02}"
                    with open(config_path, 'w') as f:
                        json.dump({"pc_id": pc_id}, f)
                    print(f"Configuration saved. This PC is now {pc_id}.")
                    return pc_id
                except ValueError:
                    print("Invalid input. Please enter a number.")

    def run_overlay(self):
        self.overlay = TimeOverlay()
        self.overlay.mainloop()

    def poll_firebase(self):
        while self.is_running:
            try:
                # Update status to ONLINE
                requests.patch(self.device_url, json={"status": "ONLINE", "lastUpdated": int(time.time() * 1000)})

                response = requests.get(self.device_url)
                if response.status_code == 200:
                    data = response.json()
                    if data and data != self.last_state:
                        self.handle_data(data)
                        self.last_state = data
            except requests.exceptions.RequestException as e:
                print(f"Connection error: {e}")
                if self.overlay:
                    self.overlay.update_timer("Connection Lost")
            
            time.sleep(2) # Poll every 2 seconds

    def handle_data(self, data):
        command = data.get("command")
        if command:
            self.execute_command(command, data)

        # Handle overlay display
        self.update_overlay_display(data)

    def execute_command(self, command, data):
        print(f"Executing command: {command}")
        
        # --- Command Execution ---
        if command in ('UNLOCK', 'UNLOCK_ALL'):
            settings = requests.get(self.settings_url).json()
            pin = settings.get('dailyPin')
            if pin:
                pyautogui.press('ctrl') # Wake screen
                time.sleep(0.5)
                pyautogui.typewrite(str(pin))
                pyautogui.press('enter')

        elif command == 'SHUTDOWN_ALL':
            os.system("shutdown /s /t 0")

        elif command == 'LOCK':
            is_unlimited = data.get('isUnlimited', False)
            end_time = data.get('endTime', 0)
            is_active = is_unlimited or (end_time > time.time() * 1000)
            if not is_active:
                pyautogui.hotkey('win', 'l')

        elif command == 'CHANGE_SYS_PASSWORD':
            new_password = data.get('newPassword')
            if new_password:
                username = os.getlogin()
                try:
                    subprocess.run(f'net user "{username}" "{new_password}"', check=True, shell=True)
                    self.overlay.show_message("Password Updated!", 5)
                except subprocess.CalledProcessError as e:
                    print(f"Failed to change password: {e}")
                    self.overlay.show_message("Password Change Failed!", 5)

        # Clear the command after execution
        requests.patch(self.device_url, json={"command": None, "newPassword": None})

    def update_overlay_display(self, data):
        if not self.overlay: return

        # Handle broadcast messages with priority
        broadcast_msg = data.get('broadcast')
        if broadcast_msg:
            self.overlay.show_message(broadcast_msg, duration=10)
            requests.patch(self.device_url, json={"broadcast": None}) # Clear after showing
            return

        # Handle timer display
        status = data.get('status')
        is_unlimited = data.get('isUnlimited', False)
        timer_text = ""

        if status == 'BUSY':
            if is_unlimited:
                start_time = data.get('startTime', 0)
                elapsed = int(time.time() * 1000) - start_time
                timer_text = f"Elapsed: {self.format_time(elapsed)}"
            else:
                end_time = data.get('endTime', 0)
                remaining = end_time - int(time.time() * 1000)
                if remaining > 0:
                    timer_text = f"Time: {self.format_time(remaining)}"
                else:
                    timer_text = "Time Expired"
                    if data.get('status') != 'LOCKED':
                         pyautogui.hotkey('win', 'l')
                         requests.patch(self.device_url, json={"status": "LOCKED"})
        
        self.overlay.update_timer(timer_text)

    def format_time(self, ms):
        total_seconds = int(ms / 1000)
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        if hours > 0:
            return f"{hours:02}:{minutes:02}:{seconds:02}"
        return f"{minutes:02}:{seconds:02}"

    def stop(self):
        self.is_running = False
        requests.patch(self.device_url, json={"status": "OFFLINE"})
        if self.overlay:
            self.overlay.destroy()

class TimeOverlay(tk.Tk):
    def __init__(self):
        super().__init__()
        self.overrideredirect(True)
        self.wm_attributes("-transparentcolor", "black")
        self.wm_attributes("-topmost", True)
        self.config(bg='black')

        self.label = tk.Label(self, text="", font=("Segoe UI", 14, "bold"), fg="white", bg="black", padx=10, pady=5)
        self.label.pack()
        self.withdraw()

    def show_message(self, message, duration=5):
        self.label.config(text=message)
        self.deiconify()
        self.place_window()
        if duration:
            self.after(duration * 1000, self.hide)

    def update_timer(self, text):
        if text:
            self.label.config(text=text)
            if not self.winfo_viewable():
                self.deiconify()
            self.place_window()
        else:
            self.hide()

    def hide(self):
        self.withdraw()

    def place_window(self):
        self.update_idletasks()
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()
        width = self.winfo_width()
        height = self.winfo_height()
        x = screen_width - width - 20
        y = screen_height - height - 50
        self.geometry(f'+{x}+{y}')

def check_for_updates():
    try:
        response = requests.get(GITHUB_RAW_URL, timeout=10)
        if response.status_code == 200:
            with open(__file__, 'r', encoding='utf-8') as f:
                current_script = f.read()
            if current_script != response.text:
                print("New version found. Updating and restarting...")
                with open(__file__, 'w', encoding='utf-8') as f:
                    f.write(response.text)
                subprocess.Popen([sys.executable] + sys.argv)
                sys.exit(0)
    except Exception as e:
        print(f"Update check failed: {e}")

def main():
    check_for_updates()
    
    agent = Agent()

    def on_quit(icon, item):
        agent.stop()
        icon.stop()

    # Create a simple icon
    width, height = 64, 64
    image = Image.new('RGB', (width, height), 'black')
    dc = ImageDraw.Draw(image)
    dc.text((10, 25), "AGENT", fill='white')

    icon = TrayIcon(
        'CyberCafeAgent',
        image,
        f"Cyber Cafe Agent - {agent.pc_id}",
        menu=Menu(MenuItem('Quit', on_quit))
    )

    # Start Firebase polling in a background thread
    poll_thread = threading.Thread(target=agent.poll_firebase, daemon=True)
    poll_thread.start()

    # Run the tray icon
    icon.run()

if __name__ == "__main__":
    main()
