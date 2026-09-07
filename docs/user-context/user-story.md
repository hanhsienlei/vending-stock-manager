> The operator's original brief, kept verbatim. It refers to photographs of the
> machines, the item map and the paper stock sheets; those were kept out of the
> public repository, so the file references below do not resolve here.

## Background
I am managing 15 vending machines in a hotel. I need to refill the products every Tuesday and Friday. I need an app to help me log stock level in each machine so I can estimate what I should grab from the storeroom before going to these machines floor by floor. 

## Features

## Vending machines
- User can add/edit the item list (like ./vending-machine-map) with info like name, slot number, picture
- User can edit the count of each item in each machine (labelled by floor) easily and quickly
- User can add remark/note for each machine or item or machine+item, such as "itemA out of stock (OOO), replaced with itemA1"
- User can log the stock level before AND after restocking.
- App shall the sale during the period

### Store room
- User can edit the stock level in the store room 
- App shall calculate the stock level of all machines, stock room, and total.
- App shall suggest what item to order from supplier for next week. 


## notes
- vending-machine-map.HEIC has the item-to-slot-and-price mapping. that's about 90 true with reality. some floors have slightly different item map, some floors have different items because of changing over of selected items or temperayly OOS. it's better to have map for each machine. but calculate the stock collectively. for the stock level. usually we keep 5 counts each item. but sometimes we store slight more (6-10) for longer shelf life items.
