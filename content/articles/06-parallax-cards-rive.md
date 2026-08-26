---
title: 3D PARALLAX CARDS
sub: AI imagery, depth layers and Rive
year: 2025
---
As a solo game developer, I’ve quickly realized that mastering every aspect of game development from art creation to animations can be daunting and time-consuming. To stay productive without sacrificing quality, I’ve adopted creative tricks and shortcuts to achieve visually impressive results without needing extensive expertise in every domain. Today, with the new Gemini 2.0 flash and ChatGPT-4o models, one effective solution I’ve found is creating stunning 3D parallax cards using AI-generated images combined with Rive App’s powerful animations.
### Step 1: Generating Stunning Imagery with AI
To start, we need visually striking images. Leveraging AI tools like Gemini 2.0 flash or ChatGPT-4o can help you produce unique, high-quality illustrations if your using a well detailled prompt.
Here is mine :
::note
Generate a slightly stylized green scale. The overall design should evoke the universe of a roguelite crossword puzzle game, featuring a dynamic cartoon look with vivid colors reminiscent of fragpunk aesthetics. Include an abstract background with speedlines to enhance an epic and mysterious atmosphere. Video game illustration style, high-definition rendering, polished finishes, and subtle details. 2:3 format.
::
If you’re not comfortable with prompts, you can give your details to chatgpt and ask them to make a prompt for you.
Lets see the prompt result :
::media{src=medium/parallax-cards-rive/01.webp label="Article illustration" fit=contain background=off height=300}
pretty cool, huh? Thats all I need for my 3d parallax card.
## Step 2: Preparing the Images for Parallax Effect
Once you’ve generated the image, the next crucial step is preparing your visuals for the parallax effect. Using tools like `Remove.bg`, `Photoroom` or AI generated image tool like Gemini 2.0 flash or ChatGPT-4o, separate your AI-generated image into different layers based on depth:
- Foreground objects
- Background scenery
Export these layers as transparent PNGs. This separation will later allow each layer to move independently, creating the 3D illusion.
::note
Prompt : “Give me the balance only”
::
::note
Prompt : “Give me the background only”
::
::media{src=medium/parallax-cards-rive/02.webp label="Article illustration" fit=contain background=off height=300}
::media{src=medium/parallax-cards-rive/03.webp label="Article illustration" fit=contain background=off height=300}
## Step 3: Crafting Interactive Parallax Animations in Rive App
Rive App is a web-based animation tool designed specifically for creating interactive animations. Its intuitive and code-free interface empowers creators to animate visually appealing graphics and seamlessly integrate them into game engine or websites. Its similar to figma but with different tools.
- First, make a new artboard
- insert new square shape to make you card.
- Duplicate your card
- rename it to “TrackingBox”
- change its background color to transparent.
::media{src=medium/parallax-cards-rive/04.webp label="Article illustration" fit=contain background=off height=300}
- Place your card background, it has to be bigger than the card size
- Then clip it to the card
::media{src=medium/parallax-cards-rive/05.webp label="Article illustration" fit=contain background=off height=300}
Let’s add a gradient overlay on the background to create space at the bottom of the card, allowing text insertion, for example :
- Duplicate your card.
- Place it above the background layer.
- Select the background color.
- Set the gradient type to “Linear.”
- Make the top color transparent black.
- Adjust as needed.
::media{src=medium/parallax-cards-rive/06.webp label="Article illustration" fit=contain background=off height=300}
Now, let’s add the foreground object and apply a corner radius to both our card and the gradient.
::media{src=medium/parallax-cards-rive/07.webp label="Article illustration" fit=contain background=off height=300}
Let’s start creating our parallax effect using bones :
- Add a bone in each corner
- Add each bone to a group using `CTRL+G`
- Add a center void group which will control the parallax effect
::media{src=medium/parallax-cards-rive/08.webp label="Article illustration" fit=contain background=off height=300}
We group each bone individually to use the group as a pivot. By rotating the pivot group and the corresponding bone in opposite directions, we ensure the bone moves positively along the X-axis when the pivot moves positively along the Y-axis.
::media{src=medium/parallax-cards-rive/09.webp label="Article illustration" fit=contain background=off height=300}
Bones rotation :
```
╔══════════════╦════════════════╦═══════════════╗
║    Corner    ║ Group Rotation ║ Bone Rotation ║
╠══════════════╬═══════════════╬═══════════════╣
║ Top Left     ║ -90°           ║ 90°           ║
║ Top Right    ║ 90°            ║ -90°          ║
║ Bottom Left  ║ 90°            ║ -90°          ║
║ Bottom Right ║ -90°           ║ 90°           ║
╚══════════════╩════════════════╩═══════════════╝
```
Now, let’s add a center parallax bone and add constraints to our bones.
- Add a new bone and place it to the center of the card
- Add a **translation constraint** to this bone with **10%** **strength** and select the parallax controller group as target.
- Add **translation constraint** to each other bones with the center parallax bone as **target**, source **space** and **dest** space in **local**.
Now, moving your parallax controller should correctly move the bones.
::media{src=medium/parallax-cards-rive/10.webp label="Article illustration" fit=contain background=off height=300}
Now that the bones move, let’s connect them to the card !
- Select your card shape, open the path, and enter **vertex edit mode**.
- Select each corner point individually.
- Bind bones by selecting all corner bones.
- For each corner, set a `100%` weight to the corresponding corner bone.
Repeat this binding process for your gradient overlay to ensure it moves in sync with your card.
::media{src=medium/parallax-cards-rive/11.webp label="Article illustration" fit=contain background=off height=300}
Now, lets add the final constraint to make the parallax effect
- Select you background
- Add a translation constraint
- Strength : `20%`
- Target : Center parallax bone
Do the same for the foreground object but with a **negative strength**.
::media{src=medium/parallax-cards-rive/12.webp label="Article illustration" fit=contain background=off height=300}
Now, thanks to Rive, i can easily animate it and applying the effect with my mouse.
- Go to the animate tab
- Add a listener
- Select “**Pointer Move**”
- Add **allign target** and select the parallax controller group.
- Click on play a move you mouse
::media{src=medium/parallax-cards-rive/13.webp label="Article illustration" fit=contain background=off height=300}
Thats it, now you can improve, custom and animate your card as you want. Lets see my final result.
::media{src=medium/parallax-cards-rive/14.webp label="Article illustration" fit=contain background=off height=300}
